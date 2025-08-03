// public/admin/js/all_bookings.js

document.addEventListener('DOMContentLoaded', () => {
    fetchAndRenderAllBookings();
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

// Function to fetch all bookings from the server and render them
async function fetchAndRenderAllBookings() {
    const allBookingsList = document.getElementById('allBookingsList');
    allBookingsList.innerHTML = '<p>Loading all bookings...</p>';

    try {
        const response = await fetch('/api/admin/all-bookings');
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch bookings: ${errorText}`);
        }
        const data = await response.json();
        const allBookings = data.allBookings;

        if (allBookings.length === 0) {
            allBookingsList.innerHTML = '<p>No bookings have been made yet.</p>';
            return;
        }

        allBookingsList.innerHTML = '';
        allBookings.forEach(booking => {
            const bookingItem = document.createElement('div');
            bookingItem.classList.add('booking-item'); // Reusing a class for styling consistency
            bookingItem.innerHTML = `
                <p><strong>Date:</strong> ${booking.booking_date}</p>
                <p><strong>Table:</strong> ${booking.table_name} (${booking.hall_name})</p>
                <p><strong>Game:</strong> ${booking.game_name || 'N/A'}</p>
                <p><strong>Players:</strong> ${booking.player_count}</p>
                <p><strong>Booked By:</strong> ${booking.booked_by_username}</p>
                <button class="button secondary-button" data-booking-id="${booking.booking_id}">Cancel</button>
            `;
            allBookingsList.appendChild(bookingItem);
        });

        // Add event listeners to delete buttons
        allBookingsList.querySelectorAll('.secondary-button').forEach(button => {
            button.addEventListener('click', cancelBooking);
        });

    } catch (error) {
        console.error('Error fetching all bookings:', error);
        showMessage(`Error fetching all bookings: ${error.message}`, 'error');
        allBookingsList.innerHTML = `<p style="color:red;">Failed to load all bookings.</p>`;
    }
}

// Function to handle cancelling a booking by admin
async function cancelBooking(event) {
    const bookingId = event.target.dataset.bookingId;
    if (confirm('Are you sure you want to cancel this booking? This action cannot be undone.')) {
        try {
            const response = await fetch(`/api/admin/bookings/${bookingId}`, {
                method: 'DELETE'
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to cancel booking: ${errorText}`);
            }
            const data = await response.json();
            showMessage(data.message, 'success');
            fetchAndRenderAllBookings(); // Refresh the list
        } catch (error) {
            console.error('Error cancelling booking:', error);
            showMessage(`Error cancelling booking: ${error.message}`, 'error');
        }
    }
}