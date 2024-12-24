from flask import Flask, render_template, request, jsonify, session
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from loguru import logger
import requests
import json
import os
import time
import urllib.parse

# Initialize the Flask application
app = Flask(__name__)
# Set a secret key for securely signing the session cookie (use environment variables in production)
app.secret_key = os.getenv("FLASK_SECRET_KEY")

# Remove default Flask log handlers to avoid duplicate logs
app.logger.handlers = []  
# Configure Loguru for enhanced logging with rotation and retention settings
logger.add("logs/app.log", rotation="10 MB", retention="7 days", level="DEBUG")

# Load application configuration from a JSON file
CONFIG_PATH = 'config.json'
if not os.path.exists(CONFIG_PATH):
    raise FileNotFoundError(f"Configuration file {CONFIG_PATH} not found.")

# Open and parse the configuration file
with open(CONFIG_PATH) as f:
    try:
        config = json.load(f)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON in {CONFIG_PATH}: {e}")

# Validate that all required keys are present in the configuration
required_keys = ['wskey', 'secret', 'oauth_server_token', 'base_api_url', 'scope']
for key in required_keys:
    if key not in config:
        raise KeyError(f"Missing required key '{key}' in {CONFIG_PATH}")

# Initialize the Flask-Limiter for rate-limiting
limiter = Limiter(
    get_remote_address,  # Use the remote IP address to track limits per client
    app=app,  # Attach the limiter to the Flask app
    default_limits=["100 per minute"]  # Set default rate limits (e.g., 100 requests/min)
)

@app.errorhandler(429)
def ratelimit_handler(e):
    """Handle requests that exceed the rate limit."""
    # Return a JSON response with an error message and HTTP status 429
    return jsonify({'error': 'Rate limit exceeded. Please try again later.'}), 429

# Global dictionary to store OAuth token and expiration information
token_info = {}

def get_access_token():
    """
    Fetch or reuse an OAuth access token.
    This token is used to authenticate API requests to the external system.
    Returns:
        str: Access token if successfully retrieved; None otherwise.
    """
    global token_info
    # Check if a valid token is already cached
    if token_info and token_info.get('expires_at') > time.time():
        return token_info['access_token']  # Return cached token if valid

    # Prepare headers for the token request (Basic Auth with WSKey and secret)
    headers = {
        'Authorization': requests.auth._basic_auth_str(config["wskey"], config["secret"]),
        'Content-Type': 'application/x-www-form-urlencoded',
    }
    # Prepare data for the token request (grant type and scope)
    data = {
        'grant_type': 'client_credentials',
        'scope': config['scope']
    }

    # Log the details of the token request for debugging
    logger.debug(f"Request URL: {config['oauth_server_token']}")
    logger.debug(f"Request Headers: {headers}")
    logger.debug(f"Request Data: {data}")

    try:
        # Make a POST request to the OAuth server to fetch the token
        response = requests.post(
            config['oauth_server_token'],
            data=urllib.parse.urlencode(data),  # Encode data for x-www-form-urlencoded
            headers=headers,
            timeout=10  # Set a timeout for the request
        )
        # Log the response status and body for debugging
        logger.debug(f"Token response status: {response.status_code}")
        logger.debug(f"Token response body: {response.text}")
        response.raise_for_status()  # Raise an exception for HTTP errors

        # Parse the JSON response to extract the token and expiration details
        result = response.json()
        token_info = {
            'access_token': result['access_token'],
            'expires_at': time.time() + result['expires_in'] - 60  # Buffer 60 seconds before expiry
        }
        return token_info['access_token']  # Return the new token
    except requests.RequestException as e:
        # Log an error if the token request fails
        logger.error(f"Error fetching access token: {e}")
        return None

# Pre-fetch an access token when the app starts
access_token = get_access_token()
if not access_token:
    # Log an error if the token cannot be fetched
    logger.error("Failed to fetch access token. Please check your configuration.")

def api_request(endpoint, method="GET", headers=None, payload=None):
    """
    Make an API request using the current OAuth access token.
    Args:
        endpoint (str): The API endpoint URL.
        method (str): The HTTP method (GET or POST).
        headers (dict): Additional HTTP headers (optional).
        payload (dict): JSON payload for POST requests (optional).
    Returns:
        dict: Parsed JSON response from the API.
    """
    # Prepare headers with the current OAuth token
    headers = headers or {}
    headers.update({'Authorization': f'Bearer {get_access_token()}', 'Accept': 'application/json'})

    try:
        # Send the appropriate HTTP request based on the method
        if method == "GET":
            response = requests.get(endpoint, headers=headers, timeout=10)
        elif method == "POST":
            response = requests.post(endpoint, headers=headers, json=payload, timeout=10)
        response.raise_for_status()  # Raise an exception for HTTP errors
        return response.json()  # Return the parsed JSON response
    except requests.HTTPError as e:
        # Log HTTP-specific errors
        logger.error(f"HTTP error during API call to {endpoint}: {e}")
        raise
    except requests.RequestException as e:
        # Log general request errors
        logger.error(f"Error during API call to {endpoint}: {e}")
        raise

@app.route('/')
def index():
    """Render the home page."""
    return render_template('index.html')  # Render an HTML template for the home page

@app.route('/lookup_patron', methods=['POST'])
def lookup_patron():
    """
    Lookup patron details using their barcode.
    Expects JSON input with a 'barcode' field.
    Returns:
        JSON: Patron details (e.g., name) or an error message.
    """
    # Extract the patron barcode from the request payload
    barcode = request.json.get('barcode')
    if not barcode:
        return jsonify({'error': 'Patron barcode is required'}), 400  # Bad Request
    if not access_token:
        return jsonify({'error': 'Access token unavailable'}), 500  # Internal Server Error

    try:
        # Construct the API endpoint for the patron lookup
        endpoint = f"{config['base_api_url']}/patrons/{barcode}"
        result = api_request(endpoint)  # Make the API request
        return jsonify({'barcode': barcode, 'name': result.get('name')})  # Return patron details
    except requests.HTTPError as e:
        # Handle 404 (Not Found) errors gracefully
        if e.response.status_code == 404:
            return jsonify({'error': 'Patron not found. Please check the barcode and try again.'}), 404
        return jsonify({'error': 'An unexpected error occurred.'}), 500
    except Exception as e:
        # Log and handle general errors
        logger.error(f"General error during patron lookup: {e}")
        return jsonify({'error': 'An unexpected error occurred. Please try again later.'}), 500

@app.route('/lookup_item', methods=['POST'])
def lookup_item():
    """
    Lookup item details using its barcode.
    Expects JSON input with a 'barcode' field.
    Returns:
        JSON: Item details (e.g., title, status) or an error message.
    """
    # Extract the item barcode from the request payload
    barcode = request.json.get('barcode')
    if not barcode:
        return jsonify({'error': 'Item barcode is required'}), 400  # Bad Request

    try:
        # Construct the API endpoint for the item lookup
        endpoint = f"{config['base_api_url']}/items/{barcode}"
        result = api_request(endpoint)  # Make the API request
        # Extract and validate the item's status
        status = result.get('status', 'unknown').lower()
        if status not in ['available', 'ready']:
            return jsonify({'error': f'Item is not available for checkout. Status: {status}'}), 400
        # Return the item details as JSON
        return jsonify({
            'barcode': barcode,
            'title': result.get('title'),
            'author': result.get('author'),
            'callNumber': result.get('callNumber'),
            'status': status.capitalize(),
        })
    except requests.HTTPError as e:
        # Handle 404 (Not Found) errors gracefully
        if e.response.status_code == 404:
            return jsonify({'error': 'Item not found. Please check the barcode and try again.'}), 404
        return jsonify({'error': 'An unexpected error occurred.'}), 500
    except Exception as e:
        # Log and handle general errors
        logger.error(f"General error during item lookup: {e}")
        return jsonify({'error': 'An unexpected error occurred. Please try again later.'}), 500

@app.route('/checkout', methods=['POST'])
def checkout():
    """
    Process a checkout request for a patron and one or more items.
    Expects JSON input with 'patronBarcode' and 'itemBarcodes'.
    Returns:
        JSON: Checkout results for each item and a summary message.
    """
    # Extract patron and item barcodes from the request payload
    data = request.json
    patron_barcode = data.get('patronBarcode')
    item_barcodes = data.get('itemBarcodes')

    # Validate input data
    if not patron_barcode or not item_barcodes:
        return jsonify({'error': 'Patron and item barcodes are required'}), 400  # Bad Request
    if not access_token:
        return jsonify({'error': 'Access token unavailable'}), 500  # Internal Server Error

    results = []  # Initialize a list to store the results for each item

    # Loop through each item barcode to process the checkout
    for barcode in item_barcodes:
        try:
            # Fetch item details (e.g., title) before checkout for enriched response
            item_details_endpoint = f"{config['base_api_url']}/items/{barcode}"
            item_details = api_request(item_details_endpoint)  # API call to fetch item details

            # Construct the checkout API endpoint and payload
            endpoint = f"{config['base_api_url']}/checkouts"
            payload = {"itemBarcode": barcode, "patronBarcode": patron_barcode}

            # Make the checkout API call
            checkout_result = api_request(endpoint, method="POST", payload=payload)

            # Add a success entry to the results list
            results.append({
                'barcode': barcode,
                'title': item_details.get('title', 'N/A'),  # Include the item's title
                'success': True,
                'dueDate': checkout_result.get('dueDate')  # Include the due date from the API response
            })
        except requests.HTTPError as e:
            # Handle HTTP-specific errors during checkout
            error_message = 'Unexpected error occurred.'
            if e.response.status_code == 404:
                error_message = 'Item or patron not found.'

            # Log the error and add a failure entry to the results list
            results.append({
                'barcode': barcode,
                'title': item_details.get('title', 'N/A') if 'item_details' in locals() else 'N/A',  # Fallback if details unavailable
                'success': False,
                'error': error_message
            })
        except Exception as e:
            # Log general errors and add a generic failure entry to the results list
            logger.error(f"Error during checkout for barcode {barcode}: {e}")
            results.append({'barcode': barcode, 'title': 'N/A', 'success': False, 'error': 'Unexpected error occurred.'})

    # Clear the patron and item data from the session after checkout
    session.pop('patron', None)
    session.pop('items', None)

    # Return a summary response with individual item results
    return jsonify({'results': results, 'message': 'Checkout completed successfully!'})

# Start the Flask development server
if __name__ == '__main__':
    app.run(debug=True)  # Enable debug mode for local development
