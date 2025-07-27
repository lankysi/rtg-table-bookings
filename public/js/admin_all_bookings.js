// DOM Elements
const bookingsListContainer = document.getElementById('bookingsListContainer');
const messageContainer = document.getElementById('messages');

// Helper function to display messages
function showMessage(message, type = 'info') {
    messageContainer.innerHTML = `<div class="message ${type}">${message}</div>`;
    // Optional: Hide message after a few seconds
    setTimeout(() => {
        messageContainer.innerHTML = '';
    }, 5000); 
}

// Function to fetch and display all bookings
async function fetchAndDisplayAllBookings() {
    showMessage('Loading all bookings...', 'info');
    bookingsListContainer.innerHTML = ''; // Clear previous content

    try {
        const response = await fetch('/api/admin/all-bookings');
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Server error or invalid response format.' }));
            throw new Error(errorData.message || 'Failed to fetch all bookings.');
        }
        const data = await response.json();

        if (data.allBookings && data.allBookings.length > 0) {
            renderBookingsTable(data.allBookings);
            showMessage('Bookings loaded successfully.', 'info');
        } else {
            bookingsListContainer.innerHTML = '<p>No bookings found.</p>';
            showMessage('No bookings to display.', 'info');
        }

    } catch (error) {
        console.error('Error fetching all bookings:', error);
        bookingsListContainer.innerHTML = '<p>Error loading bookings. Please try again.</p>';
        showMessage('Error: ' + error.message, 'error');
    }
}

// Function to render the bookings data in an HTML table
function renderBookingsTable(bookings) {
    const table = document.createElement('table');
    table.id = 'allBookingsTable'; // Assign an ID for styling

    // Create table header
    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    ['Booking ID', 'Date', 'Table', 'Hall', 'Game', 'Players', 'Booked By'].forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        headerRow.appendChild(th);
    });

    // Create table body
    const tbody = table.createTBody();
    bookings.forEach(booking => {
        const row = tbody.insertRow();
        row.insertCell().textContent = booking.booking_id;
        row.insertCell().textContent = booking.booking_date;
        row.insertCell().textContent = booking.table_name;
        row.insertCell().textContent = booking.hall_name;
        row.insertCell().textContent = booking.game_name || 'N/A'; // Handle case where game_id might be null
        row.insertCell().textContent = booking.player_count;
        row.insertCell().textContent = booking.booked_by_username;
    });

    bookingsListContainer.innerHTML = ''; // Clear "Loading..."
    bookingsListContainer.appendChild(table);
}

// Initial fetch when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', fetchAndDisplayAllBookings);