// Global state variables to track patron and items
let patronFound = false; // Indicates if a valid patron has been found
let items = []; // Array to store items added for checkout

// DOM element references
const addItemButton = document.getElementById('addItem');
const checkoutButton = document.getElementById('checkout');
const checkoutStatus = document.getElementById('checkoutStatus');
const itemStatus = document.getElementById('itemStatus');

// Function to enable/disable the checkout button based on state
function updateCheckoutButtonState() {
    // Enable checkout if a patron is found and there are items in the list
    checkoutButton.disabled = !patronFound || items.length === 0;
}

// Event listener for finding a patron by barcode
document.getElementById('findPatron').addEventListener('click', async () => {
    const barcode = document.getElementById('patronBarcode').value.trim(); // Get the patron barcode from input
    const patronStatus = document.getElementById('patronStatus'); // Status element for displaying messages

    patronStatus.textContent = 'Looking up patron...'; // Display progress message
    patronStatus.className = 'text-info'; // Set text color to indicate info state

    // Make a POST request to the server to find the patron
    const response = await fetch('/lookup_patron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode }), // Send barcode as JSON payload
    });

    const data = await response.json(); // Parse the JSON response

    if (data.error) {
        // If there's an error, display it and reset state
        patronStatus.textContent = `Error: ${data.error}`;
        patronStatus.className = 'text-danger'; // Set text color to red for error
        patronFound = false;
        addItemButton.disabled = true; // Disable add item button
        updateCheckoutButtonState();
    } else {
        // If successful, display patron information
        patronStatus.textContent = `Patron Found: ${data.name}`;
        patronStatus.className = 'text-success'; // Set text color to green for success
        patronFound = true;
        addItemButton.disabled = false; // Enable add item button
        updateCheckoutButtonState();
    }
});

// Event listener to handle invalid add item button clicks
document.getElementById('addItemWrapper').addEventListener('click', (event) => {
    if (addItemButton.disabled) {
        alert('Please find a valid patron before adding items.'); // Alert user
        event.preventDefault(); // Prevent default behavior
    }
});

// Event listener to add an item by barcode
addItemButton.addEventListener('click', async () => {
    const barcode = document.getElementById('itemBarcode').value.trim(); // Get item barcode
    itemStatus.textContent = 'Adding item...'; // Display progress message
    itemStatus.className = 'text-info'; // Set text color to indicate info state

    // Check if the item is already in the list
    if (items.some((item) => item.barcode === barcode)) {
        alert('This item is already in the list.');
        itemStatus.textContent = ''; // Clear the progress message
        return;
    }

    // Make a POST request to the server to validate the item
    const response = await fetch('/lookup_item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode }), // Send barcode as JSON payload
    });

    const data = await response.json(); // Parse the JSON response

    if (data.error) {
        alert(`Error: ${data.error}`); // Alert user of error
        itemStatus.textContent = ''; // Clear progress message
        return;
    }

    // Check if the item is available for checkout
    if (data.status.toLowerCase() !== 'available') {
        alert(`This book is not available for checkout. Current status: ${data.status}.\n` +
              `If you believe this is in error, please ask the librarian.`);
        itemStatus.textContent = ''; // Clear progress message
        return;
    }

    // Add the item to the list
    items.push({
        barcode: barcode,
        title: data.title || 'N/A',
        author: data.author || 'N/A',
        callNumber: data.callNumber || 'N/A',
        status: data.status || 'N/A',
    });

    document.getElementById('itemBarcode').value = ''; // Clear the input field
    renderItems(); // Re-render the item list
    updateCheckoutButtonState(); // Update the checkout button state

    itemStatus.textContent = 'Item found.'; // Display success message
    itemStatus.className = 'text-success'; // Set text color to green
});

// Event listener to clear all items and reset the state
document.getElementById('clearItems').addEventListener('click', () => {
    items = []; // Clear the items array
    patronFound = false; // Reset patron state

    // Clear patron and item input fields and messages
    document.getElementById('patronBarcode').value = '';
    document.getElementById('patronStatus').textContent = '';
    document.getElementById('patronStatus').className = '';
    document.getElementById('itemBarcode').value = '';
    document.getElementById('itemStatus').textContent = '';
    checkoutStatus.textContent = '';

    renderItems(); // Clear the item table
    addItemButton.disabled = true; // Disable add item button
    checkoutButton.disabled = true; // Disable checkout button
});

// Event listener to handle the checkout process
checkoutButton.addEventListener('click', async () => {
    if (checkoutButton.disabled) {
        alert('Please find a valid patron and add items before checking out.');
        return;
    }

    const patronBarcode = document.getElementById('patronBarcode').value; // Get patron barcode

    checkoutStatus.textContent = 'Checking out...'; // Display progress message
    checkoutStatus.className = 'text-info'; // Set text color to indicate info state

    // Make a POST request to the server to process the checkout
    const response = await fetch('/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patronBarcode, itemBarcodes: items.map((i) => i.barcode) }),
    });

    const data = await response.json(); // Parse the JSON response

    if (data.error) {
        alert(`Error: ${data.error}`); // Alert user of error
        checkoutStatus.textContent = ''; // Clear progress message
        return;
    }

    // Display a popup with the checkout results
    const resultsHtml = data.results
        .map((result) => {
            const item = items.find((item) => item.barcode === result.barcode); // Find item details
            return `
                <tr>
                    <td>${result.barcode}</td>
                    <td>${item?.title || 'N/A'}</td>
                    <td>${result.success ? 'Checked Out' : 'Error'}</td>
                    <td>${result.dueDate || result.error}</td>
                </tr>`;
        })
        .join('');

    const popupHtml = `
        <div id="checkoutPopup" class="popup-overlay">
            <div class="popup-content">
                <h3>Checkout Summary</h3>
                <table class="table">
                    <thead>
                        <tr>
                            <th>Barcode</th>
                            <th>Title</th>
                            <th>Status</th>
                            <th>Due Date/Error</th>
                        </tr>
                    </thead>
                    <tbody>${resultsHtml}</tbody>
                </table>
                <button id="closePopup" class="btn btn-primary mt-3">Close</button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', popupHtml); // Add the popup to the DOM

    document.getElementById('closePopup').addEventListener('click', () => {
        document.getElementById('checkoutPopup').remove(); // Remove the popup from the DOM

        // Reset application state
        items = [];
        patronFound = false;

        // Clear all UI fields and messages
        document.getElementById('patronBarcode').value = '';
        document.getElementById('patronStatus').textContent = '';
        document.getElementById('patronStatus').className = '';
        itemStatus.textContent = '';
        checkoutStatus.textContent = '';
        document.getElementById('itemBarcode').value = '';

        renderItems(); // Clear the item table
        addItemButton.disabled = true; // Disable add item button
        checkoutButton.disabled = true; // Disable checkout button
    });

    checkoutStatus.textContent = ''; // Clear the progress message
});

// Function to render the items table
function renderItems() {
    const table = document.getElementById('itemTable'); // Reference to the table body
    table.innerHTML = ''; // Clear existing rows

    items.forEach((item, index) => {
        const row = table.insertRow(); // Create a new row
        row.innerHTML = `
            <td>${item.barcode}</td>
            <td>${item.title || 'N/A'}</td>
            <td>${item.author || 'N/A'}</td>
            <td>${item.callNumber || 'N/A'}</td>
            <td class="text-success">${item.status || 'Ready to Check Out'}</td>
            <td><button class="btn btn-danger btn-sm" onclick="removeItem(${index})">Remove</button></td>
        `;
    });
}

// Function to remove an item from the list
function removeItem(index) {
    items.splice(index, 1); // Remove the item at the specified index
    renderItems(); // Re-render the items table
    updateCheckoutButtonState(); // Update the checkout button state
}
