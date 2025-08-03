// public/admin/js/manage_tables.js

let halls = [];

document.addEventListener('DOMContentLoaded', () => {
    initializePage();
    setupAddTableForm();
    setupEditTableForm();
});

// Utility function to display feedback messages
function showMessage(message, type = 'info') {
    const feedbackMessage = document.getElementById('feedback-message');
    if (feedbackMessage) {
        feedbackMessage.innerText = message;
        feedbackMessage.className = `feedback-message ${type}`;
        feedbackMessage.style.display = 'block';
        setTimeout(() => {
            feedbackMessage.style.display = 'none';
        }, 5000);
    }
}

// Initialization function to fetch all necessary data
async function initializePage() {
    try {
        await fetchHalls();
        await fetchAndRenderTables();
    } catch (error) {
        console.error('Initialization error:', error);
        showMessage(`Failed to initialize page: ${error.message}`, 'error');
    }
}

// Function to fetch all halls and populate the dropdowns
async function fetchHalls() {
    const tableHallSelect = document.getElementById('tableHall');
    const editTableHallSelect = document.getElementById('editTableHall');
    
    tableHallSelect.innerHTML = '<option value="">Loading halls...</option>';
    editTableHallSelect.innerHTML = '<option value="">Loading halls...</option>';

    try {
        const response = await fetch('/api/admin/halls');
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch halls: ${errorText}`);
        }
        const data = await response.json();
        halls = data.halls;

        tableHallSelect.innerHTML = '<option value="">Select a hall</option>';
        editTableHallSelect.innerHTML = '<option value="">Select a hall</option>';
        halls.forEach(hall => {
            const option1 = document.createElement('option');
            option1.value = hall.name;
            option1.innerText = hall.name;
            tableHallSelect.appendChild(option1);

            const option2 = document.createElement('option');
            option2.value = hall.name;
            option2.innerText = hall.name;
            editTableHallSelect.appendChild(option2);
        });

    } catch (error) {
        console.error('Error fetching halls:', error);
        showMessage(`Error fetching halls: ${error.message}`, 'error');
    }
}

// Function to fetch all tables from the server and render them
async function fetchAndRenderTables() {
    const tableList = document.getElementById('tableList');
    tableList.innerHTML = '<p>Loading tables...</p>';

    try {
        const response = await fetch('/api/admin/tables');
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch tables: ${errorText}`);
        }
        const data = await response.json();
        const tables = data.tables;

        if (tables.length === 0) {
            tableList.innerHTML = '<p>No tables have been added yet.</p>';
            return;
        }

        tableList.innerHTML = '';
        tables.forEach(table => {
            const tableDiv = document.createElement('div');
            tableDiv.classList.add('booking-item');
            tableDiv.innerHTML = `
                <p><strong>Table:</strong> ${table.name}</p>
                <p><strong>Hall:</strong> ${table.hall_name}</p>
                <button class="button edit-table-btn" data-table-id="${table.id}" data-table-name="${table.name}" data-hall-name="${table.hall_name}">Edit</button>
                <button class="button secondary-button" data-table-id="${table.id}">Delete</button>
            `;
            tableList.appendChild(tableDiv);
        });

        tableList.querySelectorAll('.secondary-button').forEach(button => {
            button.addEventListener('click', deleteTable);
        });
        
        // NEW: Add event listeners for the edit buttons
        tableList.querySelectorAll('.edit-table-btn').forEach(button => {
            button.addEventListener('click', handleEditClick);
        });

    } catch (error) {
        console.error('Error fetching tables:', error);
        showMessage(`Error fetching tables: ${error.message}`, 'error');
        tableList.innerHTML = `<p style="color:red;">Failed to load tables.</p>`;
    }
}

// Function to handle deleting a table
async function deleteTable(event) {
    const tableId = event.target.dataset.tableId;
    if (confirm('Are you sure you want to delete this table?')) {
        try {
            const response = await fetch(`/api/admin/tables/${tableId}`, {
                method: 'DELETE'
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to delete table: ${errorText}`);
            }
            const data = await response.json();
            showMessage(data.message, 'success');
            fetchAndRenderTables();
        } catch (error) {
            console.error('Error deleting table:', error);
            showMessage(`Error deleting table: ${error.message}`, 'error');
        }
    }
}

// Function to set up the form for adding a new table
function setupAddTableForm() {
    const form = document.getElementById('addTableForm');
    if (!form) return;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const name = document.getElementById('tableName').value;
        const hall_name = document.getElementById('tableHall').value;
        
        if (!name || !hall_name) {
            showMessage('All fields are required.', 'error');
            return;
        }

        try {
            const response = await fetch('/api/admin/tables', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, hall_name })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to add table: ${errorText}`);
            }
            const data = await response.json();
            showMessage(data.message, 'success');
            form.reset();
            fetchAndRenderTables();
        } catch (error) {
            console.error('Error adding table:', error);
            showMessage(`Error adding table: ${error.message}`, 'error');
        }
    });
}

// Function to handle when an Edit button is clicked
function handleEditClick(event) {
    const tableId = event.target.dataset.tableId;
    const tableName = event.target.dataset.tableName;
    const hallName = event.target.dataset.hallName;

    document.getElementById('editingTableTitle').innerText = tableName;
    document.getElementById('editTableId').value = tableId;
    document.getElementById('editTableName').value = tableName;
    document.getElementById('editTableHall').value = hallName;

    document.getElementById('editTableSection').style.display = 'block';
    showMessage('Editing table. Click update when finished.', 'info');
}

// Function to handle the form submission for editing a table
function setupEditTableForm() {
    const form = document.getElementById('editTableForm');
    const cancelBtn = document.getElementById('cancelEditBtn');

    if (!form) return;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        
        const tableId = document.getElementById('editTableId').value;
        const name = document.getElementById('editTableName').value;
        const hall_name = document.getElementById('editTableHall').value;

        try {
            const response = await fetch(`/api/admin/tables/${tableId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, hall_name })
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to update table: ${errorText}`);
            }
            const data = await response.json();
            showMessage(data.message, 'success');
            document.getElementById('editTableSection').style.display = 'none';
            fetchAndRenderTables();
        } catch (error) {
            console.error('Error updating table:', error);
            showMessage(`Error updating table: ${error.message}`, 'error');
        }
    });

    cancelBtn.addEventListener('click', () => {
        document.getElementById('editTableSection').style.display = 'none';
        showMessage('Table edit cancelled.', 'info');
    });
}