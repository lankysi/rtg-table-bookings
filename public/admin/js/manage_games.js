// public/admin/js/manage_games.js

document.addEventListener('DOMContentLoaded', () => {
    fetchAndRenderGames();
    setupAddGameForm();
    setupEditGameForm();
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

async function fetchAndRenderGames() {
    const gameList = document.getElementById('gameList');
    gameList.innerHTML = '<p>Loading games...</p>';

    try {
        const response = await fetch('/api/admin/games');
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch games: ${errorText}`);
        }
        const data = await response.json();
        const games = data.games;

        if (games.length === 0) {
            gameList.innerHTML = '<p>No games have been added yet.</p>';
            return;
        }

        gameList.innerHTML = '';
        games.forEach(game => {
            const gameDiv = document.createElement('div');
            gameDiv.classList.add('booking-item');
            gameDiv.innerHTML = `
                <p><strong>Game:</strong> ${game.name}</p>
                <button class="button edit-game-btn" data-game-id="${game.id}" data-game-name="${game.name}">Edit</button>
                <button class="button secondary-button" data-game-id="${game.id}">Delete</button>
            `;
            gameList.appendChild(gameDiv);
        });

        gameList.querySelectorAll('.secondary-button').forEach(button => {
            button.addEventListener('click', deleteGame);
        });

        gameList.querySelectorAll('.edit-game-btn').forEach(button => {
            button.addEventListener('click', handleEditClick);
        });

    } catch (error) {
        console.error('Error fetching games:', error);
        showMessage(`Error fetching games: ${error.message}`, 'error');
        gameList.innerHTML = `<p style="color:red;">Failed to load games.</p>`;
    }
}

async function deleteGame(event) {
    const gameId = event.target.dataset.gameId;
    if (confirm('Are you sure you want to delete this game? This will also affect any bookings associated with it.')) {
        try {
            const response = await fetch(`/api/admin/games/${gameId}`, {
                method: 'DELETE'
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to delete game: ${errorText}`);
            }
            const data = await response.json();
            showMessage(data.message, 'success');
            fetchAndRenderGames();
        } catch (error) {
            console.error('Error deleting game:', error);
            showMessage(`Error deleting game: ${error.message}`, 'error');
        }
    }
}

function setupAddGameForm() {
    const form = document.getElementById('addGameForm');
    if (!form) return;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const gameName = document.getElementById('gameName').value;
        if (!gameName) {
            showMessage('Game name is required.', 'error');
            return;
        }

        try {
            const response = await fetch('/api/admin/games', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: gameName })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to add game: ${errorText}`);
            }
            const data = await response.json();
            showMessage(data.message, 'success');
            form.reset();
            fetchAndRenderGames();
        } catch (error) {
            console.error('Error adding game:', error);
            showMessage(`Error adding game: ${error.message}`, 'error');
        }
    });
}

function handleEditClick(event) {
    const gameId = event.target.dataset.gameId;
    const gameName = event.target.dataset.gameName;

    document.getElementById('editingGameTitle').innerText = gameName;
    document.getElementById('editGameId').value = gameId;
    document.getElementById('editGameName').value = gameName;

    document.getElementById('editGameSection').style.display = 'block';
    showMessage('Editing game. Click update when finished.', 'info');
}

function setupEditGameForm() {
    const form = document.getElementById('editGameForm');
    const cancelBtn = document.getElementById('cancelEditBtn');

    if (!form) return;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        
        const gameId = document.getElementById('editGameId').value;
        const name = document.getElementById('editGameName').value;

        try {
            const response = await fetch(`/api/admin/games/${gameId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to update game: ${errorText}`);
            }
            const data = await response.json();
            showMessage(data.message, 'success');
            document.getElementById('editGameSection').style.display = 'none';
            fetchAndRenderGames();
        } catch (error) {
            console.error('Error updating game:', error);
            showMessage(`Error updating game: ${error.message}`, 'error');
        }
    });

    cancelBtn.addEventListener('click', () => {
        document.getElementById('editGameSection').style.display = 'none';
        showMessage('Game edit cancelled.', 'info');
    });
}