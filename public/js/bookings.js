// Global variables for client-side state
let selectedTableId = null;
let selectedBookingDate = null; // To store the YYYY-MM-DD string
let currentDisplayDate = new Date(); // Will be set to a Tuesday by populateTuesdaySelect

// Get references to HTML elements
const largeHallGrid = document.getElementById('largeHallGrid'); // New: reference to Large Hall grid
const smallHallGrid = document.getElementById('smallHallGrid'); // New: reference to Small Hall grid
const bookingForm = document.getElementById('bookingForm');
const selectedTableNameSpan = document.getElementById('selectedTableName');
const selectedBookingDateDisplaySpan = document.getElementById('selectedBookingDateDisplay');
const actualSelectedBookingDateInput = document.getElementById('actualSelectedBookingDate');
const gameSelect = document.getElementById('gameSelect');
const playerCountInput = document.getElementById('playerCount');
const confirmBookingForm = document.getElementById('confirmBookingForm');
const cancelFormBtn = document.getElementById('cancelFormBtn');
const myBookingsList = document.getElementById('myBookingsList');
const feedbackMessageDiv = document.getElementById('feedback-message');
const tuesdaySelect = document.getElementById('tuesdaySelect');

// Feedback message function
function showMessage(message, type) {
    feedbackMessageDiv.innerText = message;
    feedbackMessageDiv.className = ''; // Clear previous classes
    feedbackMessageDiv.classList.add(type);
    feedbackMessageDiv.style.display = 'block';
    setTimeout(function() {
        feedbackMessageDiv.style.display = 'none';
    }, 5000); // Hide after 5 seconds
}

// Populate Game Options (from server-side 'games' data passed as gameOptions)
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

// Function to format a Date object into 'YYYY-MM-DD'
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
}

// Function to get the next N Tuesdays starting from today/next upcoming Tuesday
function getNextNTuesdays(n) {
    const dates = [];
    let d = new Date(); // Start from current date
    d.setHours(0, 0, 0, 0); // Normalize to start of day

    let dayOfWeek = d.getDay(); // 0 for Sunday, 1 for Monday, ..., 6 for Saturday
    const tuesday = 2; // Tuesday is day 2

    // Calculate days until the *next* Tuesday (could be today if today is Tuesday)
    let daysToAdd = (tuesday - dayOfWeek + 7) % 7;
    if (daysToAdd === 0 && dayOfWeek !== tuesday) {
        daysToAdd = 7;
    }

    let currentTuesday = new Date(d.getTime());
    currentTuesday.setDate(d.getDate() + daysToAdd);

    for (let i = 0; i < n; i++) {
        const nextTuesday = new Date(currentTuesday.getTime()); // Copy the date
        nextTuesday.setDate(currentTuesday.getDate() + (i * 7)); // Add 7 days for each subsequent Tuesday
        dates.push(nextTuesday);
    }
    return dates;
}

// Function to populate the dropdown with Tuesdays
function populateTuesdaySelect() {
    tuesdaySelect.innerHTML = ''; // Clear existing options
    const nextFourTuesdays = getNextNTuesdays(4);

    if (nextFourTuesdays.length > 0) {
        nextFourTuesdays.forEach(function(tuesdayDate) {
            const option = document.createElement('option');
            const formattedDate = formatDate(tuesdayDate);
            // Display format (e.g., "Tuesday, Jul 30, 2025")
            option.innerText = tuesdayDate.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
            option.value = formattedDate; // Value will be YYYY-MM-DD for API
            tuesdaySelect.appendChild(option);
        });
        // Set the global currentDisplayDate to the first Tuesday by default
        currentDisplayDate = nextFourTuesdays[0];
    } else {
        const option = document.createElement('option');
        option.innerText = 'No Tuesdays available';
        option.value = '';
        tuesdaySelect.appendChild(option);
        tuesdaySelect.disabled = true;
    }
}

// Helper function to render a single table card
function renderTableCard(table, formattedDate, parentElement) {
    const tableCard = document.createElement('div');
    tableCard.className = 'table-card';
    tableCard.dataset.tableId = table.id;

    let statusText = 'Available';
    let statusClass = 'available';
    let isBookedByCurrentUser = false;

    if (table.booking_id) {
        statusText = 'Booked';
        statusClass = 'booked';
        if (table.booked_by_user_id == currentUser.id) {
            statusClass = 'booked-by-you';
            statusText = 'Booked (Your Booking)';
            isBookedByCurrentUser = true;
        }
    }
    
    tableCard.innerHTML =
        '<h3>' + table.name + '</h3>' +
        '<p class="status ' + statusClass + '">' + statusText + '</p>' +
        (table.booking_id ?
            '<p>Game: ' + table.game_name + '</p>' +
            '<p>Players: ' + table.player_count + '</p>' +
            '<p>Booked by: ' + table.booked_by_username + '</p>'
        : '');

    if (table.booking_id && !isBookedByCurrentUser) {
        tableCard.classList.add('not-selectable');
    } else {
        tableCard.addEventListener('click', function() {
            selectTable(table.id, formattedDate, table.name,
                        isBookedByCurrentUser ? table.booking_id : null,
                        isBookedByCurrentUser ? table.game_id : null,
                        isBookedByCurrentUser ? table.player_count : null);
        });
    }
    parentElement.appendChild(tableCard);
}


// Function to fetch tables for a specific date
async function fetchTablesForDate(date) {
    const formattedDate = formatDate(date);
    document.getElementById('currentDateDisplay').innerText = formattedDate;

    largeHallGrid.innerHTML = 'Loading available tables...';
    smallHallGrid.innerHTML = ''; // Clear the small hall grid initially
    
    try {
        const response = await fetch('/api/tables-with-bookings?date=' + formattedDate);

        // --- IMPORTANT: CHECK response.ok *BEFORE* trying to parse JSON ---
        if (!response.ok) {
            // Try to parse the error message from the server, but handle if it's not JSON
            const errorData = await response.json().catch(() => ({ message: 'Server error or invalid response format.' }));
            throw new Error(errorData.message || 'Failed to fetch tables: Server returned an error.');
        }

        const data = await response.json(); // This will now only run if response.ok is true

        // --- Your DEBUG CONSOLE.LOGS (now in a safer position) ---
        console.log("Client Debug: Data received from server:", data);
        console.log("Client Debug: Tables array in data:", data.tables);
        // --- END DEBUG CONSOLE.LOGS ---

        largeHallGrid.innerHTML = ''; // Clear previous loading message
        
        const largeHallTables = data.tables.filter(table => table.hall_name === 'Large Hall');
        const smallHallTables = data.tables.filter(table => table.hall_name === 'Small Hall');
        
        if (largeHallTables.length > 0) {
            largeHallTables.forEach(function(table) {
                renderTableCard(table, formattedDate, largeHallGrid);
            });
        } else {
            largeHallGrid.innerHTML = '<p>No tables found for this date in the Large Hall.</p>';
        }

        if (smallHallTables.length > 0) {
            smallHallTables.forEach(function(table) {
                renderTableCard(table, formattedDate, smallHallGrid);
            });
        } else {
            smallHallGrid.innerHTML = '<p>No tables available for this date in the Small Hall.</p>';
        }

    } catch (error) {
        console.error('Error fetching tables for date:', error);
        showMessage('Error loading tables: ' + error.message, 'error');
    }
}

// Updated selectTable function signature
function selectTable(tableId, bookingDate, tableName, existingBookingId, existingGameId, existingPlayerCount) {
    selectedTableId = tableId;
    selectedBookingDate = bookingDate; // Store the YYYY-MM-DD string
    selectedTableNameSpan.innerText = tableName;
    selectedBookingDateDisplaySpan.innerText = bookingDate;
    actualSelectedBookingDateInput.value = bookingDate; // Set hidden input

    if (existingBookingId) {
        gameSelect.value = existingGameId;
        playerCountInput.value = existingPlayerCount;
    } else {
        gameSelect.value = ''; // Reset for new booking
        playerCountInput.value = '1';
    }
    bookingForm.style.display = 'block';
}

// Event Listener for DOMContentLoaded - Initial Setup and Date Dropdown Handling
document.addEventListener('DOMContentLoaded', function() {
    populateTuesdaySelect(); // Populate the dropdown on page load

    // Initial load of tables for the first Tuesday in the dropdown
    fetchTablesForDate(currentDisplayDate); // currentDisplayDate is set by populateTuesdaySelect

    // Listener for the Tuesday select dropdown change
    tuesdaySelect.addEventListener('change', function(event) {
        const selectedDateString = event.target.value; // Get YYYY-MM-DD from the selected option's value
        currentDisplayDate = new Date(selectedDateString); // Update global currentDisplayDate
        fetchTablesForDate(currentDisplayDate); // Fetch tables for the newly selected date
    });

    fetchMyBookings(); // Fetch user's own bookings as well
});

// Event listener for booking form submission
confirmBookingForm.addEventListener('submit', async function(event) {
    event.preventDefault();

    const gameId = gameSelect.value;
    const playerCount = playerCountInput.value;
    const bookingDate = actualSelectedBookingDateInput.value; // Get YYYY-MM-DD string

    if (!selectedTableId || !gameId || !playerCount || !bookingDate) {
        showMessage('Please select a table, game, and number of players.', 'error');
        return;
    }

    try {
        const response = await fetch('/api/book-table', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                table_id: selectedTableId,
                game_id: gameId,
                player_count: parseInt(playerCount),
                booking_date: bookingDate // Send the YYYY-MM-DD string
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Booking failed.');
        }

        showMessage('Booking confirmed successfully!', 'success');
        bookingForm.style.display = 'none'; // Hide the form
        fetchTablesForDate(currentDisplayDate); // Refresh tables for the current date
        fetchMyBookings(); // Refresh user's own bookings
    } catch (error) {
        console.error('Error confirming booking:', error);
        showMessage('Error confirming booking: ' + error.message, 'error');
    }
});

// Event listener for cancel form button
cancelFormBtn.addEventListener('click', function() {
    bookingForm.style.display = 'none';
    selectedTableId = null; // Clear selected table
    selectedBookingDate = null; // Clear selected date
});

// Cancel Booking Function
async function cancelBooking(bookingId) {
    if (!confirm('Are you sure you want to cancel this booking?')) {
        return;
    }

    try {
        const response = await fetch('/api/cancel-booking', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ booking_id: bookingId })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to cancel booking.');
        }

        showMessage('Booking cancelled successfully!', 'success');
        fetchMyBookings(); // Refresh user's own bookings
        fetchTablesForDate(currentDisplayDate); // Refresh tables for the current date
    } catch (error) {
        console.error('Error cancelling booking:', error);
        showMessage('Error cancelling booking: ' + error.message, 'error');
    }
}

// Fetch My Bookings Function
async function fetchMyBookings() {
    myBookingsList.innerHTML = 'Loading your bookings...';
    try {
        const response = await fetch('/api/my-bookings');
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to fetch your bookings.');
        }

        if (data.bookings.length === 0) {
            myBookingsList.innerHTML = '<p>You have no active bookings.</p>';
        } else {
            myBookingsList.innerHTML = '';
            data.bookings.forEach(function(booking) {
                const bookingItem = document.createElement('div');
                bookingItem.className = 'booking-item';
                bookingItem.innerHTML =
                    '<div>' +
                        '<p><strong>Date:</strong> ' + booking.booking_date + '</p>' +
                        '<p><strong>Table:</strong> ' + booking.table_name + '</p>' +
                        '<p><strong>Game:</strong> ' + booking.game_name + '</p>' +
                        '<p><strong>Players:</strong> ' + booking.player_count + '</p>' +
                        '<button onclick="cancelBooking(' + booking.id + ')">Cancel Booking</button>' +
                        '<hr>' +
                    '</div>';
                myBookingsList.appendChild(bookingItem);
            });
        }

    } catch (error) {
        console.error('Error fetching my bookings:', error);
        showMessage('Error loading your bookings: ' + error.message, 'error');
    }
}