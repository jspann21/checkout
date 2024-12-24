let patronFound = false;
let items = [];

const addItemButton = document.getElementById('addItem');
const checkoutButton = document.getElementById('checkout');
const checkoutStatus = document.getElementById('checkoutStatus');
const itemStatus = document.getElementById('itemStatus');

function updateCheckoutButtonState() {
    checkoutButton.disabled = !patronFound || items.length === 0;
}

document.getElementById('findPatron').addEventListener('click', () => {
    const barcode = document.getElementById('patronBarcode').value.trim();
    const patronStatus = document.getElementById('patronStatus');

    if (barcode === '12345') {
        patronStatus.textContent = 'Patron Found: John Doe';
        patronStatus.className = 'text-success';
        patronFound = true;
        addItemButton.disabled = false;
    } else {
        patronStatus.textContent = 'Error: Patron not found.';
        patronStatus.className = 'text-danger';
        patronFound = false;
        addItemButton.disabled = true;
    }
    updateCheckoutButtonState();
});

document.getElementById('addItemWrapper').addEventListener('click', (event) => {
    if (addItemButton.disabled) {
        alert('Please find a valid patron before adding items.');
        event.preventDefault();
    }
});

addItemButton.addEventListener('click', () => {
    const barcode = document.getElementById('itemBarcode').value.trim();

    if (items.some(item => item.barcode === barcode)) {
        alert('This item is already in the list.');
        return;
    }

    if (barcode === '123') {
        items.push({ barcode, title: 'Book Title A', author: 'Author A', callNumber: 'BT 112 .M3 2000', status: 'Available' });
        itemStatus.textContent = 'Item found.';
        itemStatus.className = 'text-success';
    } else if (barcode === '456') {
        items.push({ barcode, title: 'Book Title B', author: 'Author B', callNumber: 'BL 123 .M3 2024', status: 'Available' });
        itemStatus.textContent = 'Item found.';
        itemStatus.className = 'text-success';
    } else {
        alert('Error: Item not found.');
        itemStatus.textContent = 'Error: Item not found.';
        itemStatus.className = 'text-danger';
    }

    renderItems();
    updateCheckoutButtonState();
});

document.getElementById('clearItems').addEventListener('click', () => {
    items = [];
    patronFound = false;

    document.getElementById('patronBarcode').value = '';
    document.getElementById('patronStatus').textContent = '';
    document.getElementById('itemBarcode').value = '';
    itemStatus.textContent = '';
    checkoutStatus.textContent = '';

    renderItems();
    addItemButton.disabled = true;
    checkoutButton.disabled = true;
});

checkoutButton.addEventListener('click', () => {
    if (checkoutButton.disabled) {
        alert('Please find a valid patron and add items before checking out.');
        return;
    }

    checkoutStatus.textContent = 'Checking out...';
    checkoutStatus.className = 'text-info';

    setTimeout(() => {
        items.forEach((item) => {
            item.status = 'Checked Out';
        });

        const resultsHtml = items.map(item => `
            <tr>
                <td>${item.barcode}</td>
                <td>${item.title}</td>
                <td>Checked Out</td>
                <td>Due in 14 Days</td>
            </tr>
        `).join('');

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
                                <th>Due Date</th>
                            </tr>
                        </thead>
                        <tbody>${resultsHtml}</tbody>
                    </table>
                    <button id="closePopup" class="btn btn-primary mt-3">Close</button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', popupHtml);

        document.getElementById('closePopup').addEventListener('click', () => {
            document.getElementById('checkoutPopup').remove();
            items = [];
            patronFound = false;
            document.getElementById('patronBarcode').value = '';
            document.getElementById('patronStatus').textContent = '';
            document.getElementById('patronStatus').className = '';
            itemStatus.textContent = '';
            checkoutStatus.textContent = '';
            document.getElementById('itemBarcode').value = '';
            renderItems();
            addItemButton.disabled = true;
            checkoutButton.disabled = true;
        });

        checkoutStatus.textContent = ''; // Clear the progress message after the popup is displayed
    }, 1000);
});

function renderItems() {
    const table = document.getElementById('itemTable');
    table.innerHTML = '';
    items.forEach((item, index) => {
        const row = table.insertRow();
        row.innerHTML = `
            <td>${item.barcode}</td>
            <td>${item.title}</td>
            <td>${item.author}</td>
            <td>${item.callNumber}</td>
            <td>${item.status}</td>
            <td><button class="btn btn-danger btn-sm" onclick="removeItem(${index})">Remove</button></td>
        `;
    });
}

function removeItem(index) {
    items.splice(index, 1);
    renderItems();
    updateCheckoutButtonState();
}
