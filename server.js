/*
Mark Kaganovsky
100963794
*/

/*
Some code provided by Andrew Runka.
*/

// Modules
const http = require('http').createServer(handler);
const io = require('socket.io')(http);
const fs = require('fs');
const url = require("url");
const mime = require("mime-types");

// Constants
const ROOT = "./public";
const PORT = 2406;

const CONTENT_TYPE_TEXT_HTML = {'Content-Type' : 'text/html'};
const CONTENT_TYPE_TEXT_PLAIN = {'Content-Type' : 'text/plain'};

// Start server.
http.listen(PORT);
console.log("Chat server listening on port 2406");

function handler(req,res){
	let urlObj = url.parse(req.url, true);

	let filePath = ROOT + "/";

	// Check if the root directory is being requested.
	filePath += urlObj.pathname === "/" ? "index.html" : urlObj.pathname;

	// Check if requested file path is a directory.
	fs.stat(filePath, function(err, stats){
		// Could not get stats on file.
		if(err){
			serve404(res);
			return;
		}

		// If file is directory, serve index.html file.
		if(stats.isDirectory()){
			filePath = ROOT + "/index.html";
		}

		// Try to read the file.
		fs.readFile(filePath, function(err,data){
			if(err){ // Could not read file.
				console.log("ERROR: Could not read file: " + filePath);
				console.log(err);
				serve404(res);
			}
			else{ // Read file
				// Figure out the content type.
				let contentType = CONTENT_TYPE_TEXT_HTML;

				// See if a more specific mime-type is available.
				let mimeType = mime.lookup(filePath);
				if(mimeType){
					contentType = {"Content-Type" : mimeType};
				}

				// Send file.
				res.writeHead(200, contentType);
				res.end(data);
			}
		});
	});
};

/*
Serves the 404.html page to the response stream.
If the 404 page is not found, serves a plain text 500 error.
*/
function serve404(res){
	fs.readFile("${ROOT}/404.html", function(err, data){
		if(err){ // Could not read 404 file
			console.log("ERROR, Could not read 404 file.");
			console.log(err);
			res.writeHead(500, CONTENT_TYPE_TEXT_PLAIN);
			res.end("500 Internal Server Error");
		}
		else{ // Respond with 404 file.
			res.writeHead(404, CONTENT_TYPE_TEXT_HTML);
			res.end(data);
		}
	});
}

let clients = [];

function addClient(socket){
	clients.push(socket);
}

io.on("connection", function(socket){
	console.log("Got a connection");

	socket.on("intro", function(data){
		newClientInit(socket, data);
		addClient(socket);

		console.log(`User ${socket.username} has joined.`);

		socket.emit("userList", {users : getUsernameList()}); // Send full user list to this new user.

		broadcastNewUserConnected(socket); // Send new user to all connected clients.

		// Send welcoming messages.
		socket.broadcast.emit("message", `${timestamp()} - ${socket.username} has entered the chat room.`);
		socket.emit("message", `${timestamp()} - Welcome, ${socket.username}`); // Notify client that they have entered the chat room.
	});

	socket.on("message", function(data){
		console.log("got message: " + data);
		broadcastMessageBlockSensitive(socket.username, `${timestamp()} - ${socket.username}: ${data}`);
	});

	socket.on("privateMessage", function(data){
		console.log("Got a private message: ");
		console.log(data);
		handlePrivateMessage(socket, data.username, data.message);
	});

	socket.on("blockUser", function(data){
		console.log("Blocking/Unblocking user: ");
		console.log(data);

		// Respond with an event stating which user was blocked/unblocked.
		socket.emit("userBlock", {
			username : data.username,
			hasBeenBlocked : toggleBlockedUser(socket.blockedUsers, data.username)
		});
	});

	socket.on("disconnect", function(){
		console.log(socket.username + " has disconnected.");
		removeClient(socket);
		broadcastClientDisconnect(socket.username);
	});
});

/*
Initalizes a new socket with a username and list of blocked users.
*/
function newClientInit(socket, username){
	socket.username = username; // Save client username
	socket.blockedUsers = {}; // Create empty object of blocked users.
}

/*
Broadcasts a message to ALL users, including the sender.

If the sender is blocked by a certain socket then that message is not sent.

returns nothing.
*/
function broadcastMessageBlockSensitive(username, message){
	clients.forEach(function(socket){ // For each connected client
		if(!isUserBlocked(socket.blockedUsers, username)){ // Check if the sender is blocked by this client
			socket.emit("message", message); // Send message if client isnt blocked.
		}
	});
}

/*
Broadcasts the new user to all clients except the newly connected socket.

Send a newUserConnected socket.io event which contains the new users username,
along with whether that user is blocked by the current socket.

Returns nothing.
*/
function broadcastNewUserConnected(newSocket){
	clients.forEach(function(socket){ // For each currently connected client.
		if(socket !== newSocket){ // Skip the newly connected client.
			socket.emit("newUserConnected", {
				username : newSocket.username,
				isBlocked : isUserBlocked(socket.blockedUsers, newSocket.username)
			});
		}
	});
}

/*
broadcasts a message and event stating that a client has disconnected.
*/
function broadcastClientDisconnect(username){
	io.emit("message", `${timestamp()} - ${username} has disconnected`);
	io.emit("clientDisconnect", { username : username });
}

/*
Removes a specific socket from the clients array.
*/
function removeClient(socket){
	let i;

	for(i=0; i<clients.length; ++i){
		if(socket === clients[i]){ break; }
	}

	clients.splice(i, 1);
}

/*
Finds a socket associated with a particular username.

Returns either the socket or null if that username does not exist.
*/
function findSocketFromUsername(username){
	for(let i=0; i<clients.length; ++i){
		if(clients[i].username === username){
			return clients[i];
		}
	}
	return null;
}

/*
Given a sender socket, username of reciever, and a message, sends the message
to the specified reciever only if the sender is not on the recievers block list.

If the reciever is not currently connected, send back to the sender a message stating
that the user is not currently connected.
*/
function handlePrivateMessage(senderSocket, recieverUsername, message){
	// Get socket for the username to send the message to.
	let recieverSocket = findSocketFromUsername(recieverUsername);

	if(recieverSocket){ // User still connected.
		// Check if reciever has blocked the sender.
		if(isUserBlocked(recieverSocket.blockedUsers, senderSocket.username)){
			sendPrivateMessageError(`User ${recieverUsername} has blocked you.`)
		}
		else{ // Send private message.
			recieverSocket.emit("privateMessage", {
				username : senderSocket.username,
				message : message
			});
		}
	}
	else{ // The client that the user wants to send the message to has disconnected.
		sendPrivateMessageError(`User ${recieverUsername} is not currently connected.`);
	}

	/*
	Emits a privateMessageError event with the specified error message.
	*/
	function sendPrivateMessageError(errorMessage){
		senderSocket.emit("privateMessageError", errorMessage);
	}
}

/*
Toggles the blocking of a user for a certain user's block list.

Takes the object containing the blocked users, along with a username
to toggle block/unblock.

Returns true if the user has been blocked, false if the user has been
unblocked.

Runs in O(1) time.
*/
function toggleBlockedUser(blockedUsers, usernameToToggle){
	if(isUserBlocked(blockedUsers, usernameToToggle)){ // Unblock user
		delete blockedUsers[usernameToToggle]; // Remove property from blockedusers object.
		return false;
	}
	else{ // Block user
		blockedUsers[usernameToToggle] = true;
		return true;
	}
}

/*
Checks if a user is currently blocked.

Takes in an object containing the blocked users, along with a username
to check for blocked status.

Returns true if the user is blocked, false otherwise.

Runs in O(1) time.
*/
function isUserBlocked(blockedUsers, username){
	return blockedUsers.hasOwnProperty(username);
}

/*
Creates a listing of usernames from currently connected sockets.
Returns an array of usernames.
*/
function getUsernameList(){
	let usernameList = [];
	clients.forEach(function(socket){
		usernameList.push(socket.username);
	});
	return usernameList;
}

/*
Returns a string version of the current time.
*/
function timestamp(){
	return new Date().toLocaleTimeString();
}
