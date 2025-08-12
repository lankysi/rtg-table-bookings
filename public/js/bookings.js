// public/js/bookings.js

let tablesData = [];
let currentUser = null;
let selectedTable = null;
let selectedDate = new Date().toISOString().split('T')[0];

document.addEventListener('DOMContentLoaded', async () => {
    // Set initial date in the date picker
    const datePicker = document.getElementById('datePicker');
    if (datePicker) {
        datePicker.value = selectedDate;
        datePicker.addEventListener('change', (e) => {
            selectedDate = e.target.value;
            initializeBookingsPage();
        });
    }

    // Set up event listeners for the booking form
    setupBookingForm();
    await initializeBookingsPage();
});

// Utility function to make API calls
async function fetchData(url, options = {}) {
    const response = await fetch(url, options);
    const contentType = response.headers.get('content-type');
    let responseData;

    if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
    } else {
        responseData = await response.text();
    }

    if (!response.ok) {
        console.error('Fetch error from ' + url + ':', response.status, responseData);
        throw new Error(responseData.message || responseData || 'An unknown error occurred.');
    }
    return responseData;
}

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

// Main function to initialize the bookings page
async function initializeBookingsPage() {
    try {
        await fetchCurrentUser();
        await fetchGamesAndPopulateDropdown();
        await fetchAndDisplayTables(selectedDate);
        await fetchAndDisplayMyBookings();
    } catch (error) {
        console.error('Error initializing bookings page:', error);
        showMessage(`Failed to initialize page: ${error.message}`, 'error');
    }
}

// Fetch the current user details
async function fetchCurrentUser() {
    try {
        currentUser = await fetchData('/api/current-user');
    } catch (error) {
        console.error('Failed to fetch current user:', error);
        currentUser = null;
    }
}

// Fetch games and populate the dropdown in the booking form
async function fetchGamesAndPopulateDropdown() {
    const gameSelect = document.getElementById('gameSelect');
    if (!gameSelect) return;

    try {
        const games = await fetchData('/api/games');
        if (!games || !games.games || games.games.length === 0) {
            gameSelect.innerHTML = '<option value="">No games found</option>';
            return;
        }

        gameSelect.innerHTML = '<option value="">Select a game (optional)</option>';

        games.games.forEach(game => {
            const option = document.createElement('option');
            option.value = game.id;
            option.innerText = game.name;
            gameSelect.appendChild(option);
        });

    } catch (error) {
        console.error('Error fetching games for dropdown:', error);
        gameSelect.innerHTML = '<option value="">Error loading games</option>';
    }
}

// Helper to get game name by ID
function getGameNameById(gameId) {
    const gameSelect = document.getElementById('gameSelect');
    if (!gameSelect) return null;
    const option = gameSelect.querySelector(`option[value="${gameId}"]`);
    return option ? option.innerText : null;
}

// Fetch tables and display them on the page
async function fetchAndDisplayTables(date) {
    try {
        const response = await fetchData(`/api/tables/availability?date=${date}`);
        tablesData = response.tables;

        const largeHallGrid = document.getElementById('largeHallGrid');
        const smallHallGrid = document.getElementById('smallHallGrid');

        if (!largeHallGrid || !smallHallGrid) {
            console.error("Hall grid elements not found.");
            return;
        }

        largeHallGrid.innerHTML = '';
        smallHallGrid.innerHTML = '';

        tablesData.forEach(table => {
            const tableDiv = document.createElement('div');
            tableDiv.classList.add('table-item');

            if (table.booking_id) {
                tableDiv.classList.add('booked');
                let bookingInfo = `
                    <span class="booking-status">Booked</span>
                    <br>Game: ${getGameNameById(table.game_id) || 'N/A'}
                    <br>Players: ${table.player_count}
                `;
                if (currentUser && table.booked_by_user_id === currentUser.id) {
                    tableDiv.classList.add('my-booking');
                    bookingInfo += '<br>(Your Booking)';
                }
                tableDiv.innerHTML = `
                    <h4>${table.table_name}</h4>
                    ${bookingInfo}
                `;
            } else {
                tableDiv.classList.add('available');
                tableDiv.onclick = () => selectTableForBooking(table.table_id, table.table_name, date);
                tableDiv.innerHTML = `
                    <h4>${table.table_name}</h4>
                    <span class="booking-status">Available</span>
                `;
            }

            if (table.hall_name === 'Large Hall') {
                largeHallGrid.appendChild(tableDiv);
            } else if (table.hall_name === 'Small Hall') {
                smallHallGrid.appendChild(tableDiv);
            }
        });
    } catch (error) {
        console.error('Error fetching tables:', error);
        showMessage(`Failed to load tables: ${error.message}. Please try again.`, 'error');
    }
}

// Function to handle selecting a table
function selectTableForBooking(tableId, tableName, date) {
    selectedTable = { id: tableId, name: tableName, date: date };
    const bookingDetails = document.getElementById('bookingDetails');
    bookingDetails.innerHTML = `
        <h3>Booking Details</h3>
        <p>You have selected table **${tableName}** for **${date}**.</p>
    `;
    document.getElementById('bookingFormSection').style.display = 'block';
    showMessage('Please fill in the details below to confirm your booking.', 'info');
}

// Function to set up the booking form event listener
function setupBookingForm() {
    const form = document.getElementById('bookingForm');
    if (!form) return;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (!selectedTable) {
            showMessage('Please select a table first.', 'error');
            return;
        }

        const player_count = document.getElementById('playerCount').value;
        const game_id = document.getElementById('gameSelect').value || null;

        if (!player_count) {
            showMessage('Number of players is required.', 'error');
            return;
        }

        const bookingData = {
            table_id: selectedTable.id,
            date: selectedTable.date,
            game_id: game_id,
            player_count: player_count
        };

        try {
            const response = await fetchData('/api/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bookingData)
            });

            showMessage(response.message, 'success');
            form.reset();
            document.getElementById('bookingFormSection').style.display = 'none';
            selectedTable = null;
            initializeBookingsPage();
        } catch (error) {
            console.error('Error confirming booking:', error);
            showMessage(`Error confirming booking: ${error.message}`, 'error');
        }
    });
}

// Fetch and display the current user's bookings
async function fetchAndDisplayMyBookings() {
    const myBookingsList = document.getElementById('myBookingsList');
    if (!myBookingsList) return;
    myBookingsList.innerHTML = '<p>Loading your bookings...</p>';

    try {
        const myBookings = await fetchData('/api/user/bookings');

        if (!myBookings || !myBookings.bookings || myBookings.bookings.length === 0) {
            myBookingsList.innerHTML = '<p>You have no upcoming bookings.</p>';
            return;
        }

        myBookingsList.innerHTML = '';
        myBookings.bookings.forEach(booking => {
            const bookingDiv = document.createElement('div');
            bookingDiv.classList.add('booking-item');
            bookingDiv.innerHTML = `
                <p><strong>Date:</strong> ${booking.booking_date}</p>
                <p><strong>Table:</strong> ${booking.table_name} (${booking.hall_name})</p>
                <p><strong>Game:</strong> ${booking.game_name || 'Not specified'}</p>
                <p><strong>Players:</strong> ${booking.player_count}</p>
                <button class="button secondary-button" data-booking-id="${booking.id}">Cancel</button>
            `;
            myBookingsList.appendChild(bookingDiv);
        });

        myBookingsList.querySelectorAll('.secondary-button').forEach(button => {
            button.addEventListener('click', cancelBooking);
        });

    } catch (error) {
        console.error('Error fetching user bookings:', error);
        showMessage('Failed to load your bookings. Please try again.', 'error');
    }
}

// Function to handle canceling a booking
async function cancelBooking(event) {
    const bookingId = event.target.dataset.bookingId;
    if (confirm('Are you sure you want to cancel this booking?')) {
        try {
            const response = await fetchData(`/api/bookings/${bookingId}`, {
                method: 'DELETE'
            });
            showMessage(response.message, 'success');
            initializeBookingsPage();
        } catch (error) {
            console.error('Error canceling booking:', error);
            showMessage(`Error canceling booking: ${error.message}`, 'error');
        }
    }
}