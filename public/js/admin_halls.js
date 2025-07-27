<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Hall Management</title>
    <link rel="stylesheet" href="/styles.css">
</head>
<body>
    <div class="container">
        <h1>Admin Hall Management</h1>
        <p><a href="/profile">Back to Profile</a></p>

        <div id="messages" class="message-container"></div>

        <h2>Disable Small Hall for a Date</h2>
        <form id="disableHallForm">
            <label for="disableDateSelect">Select Date:</label>
            <select id="disableDateSelect"></select>
            <button type="submit">Disable Small Hall</button>
        </form>

        <h2>Currently Disabled Dates</h2>
        <div id="disabledDatesList">
            <p>Loading disabled dates...</p>
        </div>
    </div>

    <script src="/js/admin_halls.js"></script>
</body>
</html>