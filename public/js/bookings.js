// public/js/bookings.js

// 1. Declare gameOptions and currentUser at the top-level scope
//    so they are accessible throughout the script after being populated.
let currentUser = null;
let gameOptions = [];
let tablesData = {}; // To store fetched table availability data

// Utility function to fetch JSON data
async function fetchData(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) {
        const errorText = await response.text(); // Get raw text to help debug
        console.error(`Fetch error from ${url}:`, response.status, errorText);
        let message = `HTTP error! status: ${response.status}`;
        try {
            const errorJson = JSON.parse(errorText);
            if (errorJson.message) {
                message = errorJson.message;
            }
        } catch (e) {
            // Not a JSON error message, use the raw text or default
            message = errorText || message;
        }
        throw new Error(message);
    }
    return response.json();
}

// Function to initialize dynamic data and then render page
async function initializeBookingsPage() {
    try {
        // Fetch current user data
        currentUser = await fetchData('/api/current-user');
        console.log('Current User Data:', currentUser);

        // Fetch game options
        const gamesData = await fetchData('/api/game-options');
        gameOptions = gamesData.games; // Assign to the top-level gameOptions
        console.log('Game Options:', gameOptions);

        // --- Now that data is loaded, populate the game select dropdown ---
        const gameSelect = document.getElementById('gameSelect');
        if (gameSelect) {
            if (gameOptions && Array.isArray(gameOptions)) {
                gameOptions.forEach(function(game) {
                    const option = document.createElement('option');
                    option.value = game.id;
                    option.innerText = game.name;
                    gameSelect.appendChild(option);
                });
            } else {
                console.error("Game options not loaded correctly or are empty.");
            }
        } else {
             console.error("gameSelect element not found.");
        }

        // Call other main rendering functions here, ensuring they use the now-populated gameOptions/currentUser
        populateTuesdaysDropdown();
        // Get the initial selected date from the dropdown, or default to the first Tuesday
        const initialDate = document.getElementById('tuesdaySelect').value || getNextNTuesdays(1)[0].value;
        fetchAndDisplayTables(initialDate);
        fetchAndDisplayMyBookings();

    } catch (error) {
        console.error("Error initializing bookings page:", error);
        showMessage(`Failed to load essential booking data: ${error.message}. Please try again.`, 'error');
        // Disable booking functionality if essential data can't be loaded
        const bookingForm = document.getElementById('bookingForm');
        if (bookingForm) {
            document.getElementById('bookingForm').style.display = 'none';
        }
    }
}

// --- Event Listener to start the process when the DOM is ready ---
document.addEventListener('DOMContentLoaded', () => {
    initializeBookingsPage();
});

// --- Helper Functions ---

function getNextNTuesdays(n) {
    const today = new Date();
    const tuesdays = [];
    let daysToAdd = (2 - today.getDay() + 7) % 7; // Days until next Tuesday (2 is Tuesday)

    // If today is Tuesday, check if it's past 6 PM. If so, move to next Tuesday.
    if (daysToAdd === 0 && today.getDay() === 2) {
        const currentHour = today.getHours();
        if (currentHour >= 18) { // Assuming bookings are for 6 PM (18:00) onwards
             daysToAdd = 7; // Move to next Tuesday
        }
    }

    for (let i = 0; i < n; i++) {
        const nextTuesday = new Date(today);
        nextTuesday.setDate(today.getDate() + daysToAdd + (i * 7));
        tuesdays.push({
            date: nextTuesday,
            value: nextTuesday.toISOString().split('T')[0], // YYYY-MM-DD
            text: nextTuesday.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        });
    }
    return tuesdays;
}

function populateTuesdaysDropdown() {
    const tuesdaySelect = document.getElementById('tuesdaySelect');
    if (!tuesdaySelect) {
        console.error("Tuesday select dropdown not found.");
        return;
    }

    const nextTuesdays = getNextNTuesdays(4); // Get next 4 Tuesdays

    tuesdaySelect.innerHTML = ''; // Clear existing options
    nextTuesdays.forEach(tue => {
        const option = document.createElement('option');
        option.value = tue.value;
        option.innerText = tue.text;
        tuesdaySelect.appendChild(option);
    });

    // Set current date display initially
    document.getElementById('currentDateDisplay').innerText = nextTuesdays[0].text;

    // Add event listener for date change
    tuesdaySelect.addEventListener('change', (event) => {
        const selectedDate = event.target.value;
        document.getElementById('currentDateDisplay').innerText = event.target.options[event.target.selectedIndex].text;
        fetchAndDisplayTables(selectedDate);
    });
}

// Function to fetch and display table availability
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

// Helper to get game name by ID (used in fetchAndDisplayTables)
function getGameNameById(gameId) {
    const game = gameOptions.find(g => g.id === gameId);
    return game ? game.name : 'Unknown Game';
}

// Function to handle selecting a table for booking
function selectTableForBooking(tableId, tableName, bookingDate) {
    document.getElementById('selectedTableId').value = tableId;
    document.getElementById('selectedTableName').innerText = tableName;
    document.getElementById('actualSelectedBookingDate').value = bookingDate; // Store actual date
    document.getElementById('selectedBookingDateDisplay').innerText = document.getElementById('tuesdaySelect').options[document.getElementById('tuesdaySelect').selectedIndex].text; // Display friendly date

    document.getElementById('bookingForm').style.display = 'block';
    showMessage(`Selected ${tableName} for booking on ${document.getElementById('selectedBookingDateDisplay').innerText}.`, 'info');
}


// Event listener for the booking confirmation form
document.getElementById('confirmBookingForm').addEventListener('submit', async (event) => {
    event.preventDefault(); // Prevent default form submission

    const tableId = document.getElementById('selectedTableId').value;
    const bookingDate = document.getElementById('actualSelectedBookingDate').value;
    const gameId = document.getElementById('gameSelect').value;
    const playerCount = document.getElementById('playerCount').value;

    try {
        const response = await fetchData('/api/book-table', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                tableId: parseInt(tableId),
                bookingDate: bookingDate,
                gameId: parseInt(gameId),
                playerCount: parseInt(playerCount)
            })
        });

        showMessage(response.message, 'success');
        document.getElementById('bookingForm').style.display = 'none'; // Hide form on success
        // Refresh tables to show new booking
        fetchAndDisplayTables(bookingDate);
        fetchAndDisplayMyBookings(); // Refresh user's own bookings

    } catch (error) {
        console.error('Error confirming booking:', error);
        showMessage(`Booking failed: ${error.message}`, 'error');
    }
});

// Event listener for cancelling the booking form
document.getElementById('cancelFormBtn').addEventListener('click', () => {
    document.getElementById('bookingForm').style.display = 'none';
    showMessage('Booking cancelled by user.', 'info');
});

// Function to fetch and display the user's current bookings
async function fetchAndDisplayMyBookings() {
    const myBookingsList = document.getElementById('myBookingsList');
    if (!myBookingsList) {
        console.error("My bookings list element not found.");
        return;
    }
    myBookingsList.innerHTML = 'Loading your bookings...'; // Initial loading message

    try {
        const data = await fetchData('/api/user/bookings');
        const userBookings = data.userBookings;

        if (userBookings.length === 0) {
            myBookingsList.innerHTML = '<p>You have no upcoming bookings.</p>';
            return;
        }

        myBookingsList.innerHTML = ''; // Clear previous content

        userBookings.forEach(booking => {
            const bookingItem = document.createElement('div');
            bookingItem.classList.add('booking-item');
            bookingItem.innerHTML = `
                <p><strong>Date:</strong> ${booking.booking_date}</p>
                <p><strong>Table:</strong> ${booking.table_name} (${booking.hall_name})</p>
                <p><strong>Game:</strong> ${booking.game_name || 'N/A'}</p>
                <p><strong>Players:</strong> ${booking.player_count}</p>
                <button class="cancel-booking-btn" data-booking-id="${booking.booking_id}">Cancel Booking</button>
            `;
            myBookingsList.appendChild(bookingItem);
        });

        // Add event listeners to cancel buttons
        myBookingsList.querySelectorAll('.cancel-booking-btn').forEach(button => {
            button.addEventListener('click', async (event) => {
                const bookingId = event.target.dataset.bookingId;
                if (confirm('Are you sure you want to cancel this booking?')) {
                    try {
                        const response = await fetchData(`/api/bookings/${bookingId}`, {
                            method: 'DELETE'
                        });
                        showMessage(response.message, 'success');
                        // Refresh both user's bookings and general table availability
                        fetchAndDisplayMyBookings();
                        // Refresh tables for the currently selected date
                        const selectedDate = document.getElementById('tuesdaySelect').value;
                        fetchAndDisplayTables(selectedDate);
                    } catch (error) {
                        console.error('Error cancelling booking:', error);
                        showMessage(`Failed to cancel booking: ${error.message}`, 'error');
                    }
                }
            });
        });

    } catch (error) {
        console.error('Error fetching user bookings:', error);
        myBookingsList.innerHTML = `<p style="color: red;">Error loading your bookings: ${error.message}</p>`;
    }
}

// Function to display messages to the user
function showMessage(message, type = 'info') {
    const feedbackMessage = document.getElementById('feedback-message');
    if (feedbackMessage) {
        feedbackMessage.innerText = message;
        // Apply a class for styling (e.g., 'success', 'error', 'info')
        feedbackMessage.className = `feedback-message ${type}`;
        feedbackMessage.style.display = 'block'; // Make it visible
        setTimeout(() => {
            feedbackMessage.style.display = 'none'; // Hide after some time
        }, 5000);
    }
}