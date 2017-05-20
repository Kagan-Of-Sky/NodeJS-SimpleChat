/*
Mark Kaganovsky
100963794
*/

$(document).ready(function(){
	// Get username from user.
	let username = getUsername();

	let socket = io(); //connect to the server that sent this page

	// As soon as we connect send this users username.
	socket.on('connect', function(){
		socket.emit("intro", username);
	});

	/*
	List of users is sent once per connection.
	*/
	socket.on('userList', function(data){
		let userList = $("#userList");
		userList.empty(); // Empty current user list.

		// Add a list of all the current users.
		data.users.forEach(function(element){
			let newUserListItem = $("<li>").attr("id", element).text(element);

			// Style and skip double click listener for THIS user, so they cant private message or block themselves.
			if(element === username){
				newUserListItem.addClass("youUser").html(newUserListItem.text() + "&nbsp;(you)");
			}
			else{
				newUserListItem.addClass("unblockedUser").addClass("otherUserItem").dblclick(userListItemDoubleClickHandler);
			}
			userList.append(newUserListItem);
		});
	});

	/*
	When new user connects, the server will send their username and blockstatus to all users.
	*/
	socket.on("newUserConnected", function(data){
		let newUserListItem = $("<li>")
			.attr("id", data.username)
			.addClass("otherUserItem")
			.addClass(data.isBlocked ? "blockedUser" : "unblockedUser")
			.text(data.username)
			.dblclick(userListItemDoubleClickHandler);

		$("#userList").append(newUserListItem);
	});

	/*
	Toggles the classes for a blocked user/unblocked user and appends the block status to the chat log.
	*/
	socket.on("userBlock", function(data){
		$("#" + data.username).toggleClass("unblockedUser").toggleClass("blockedUser");
		appendToChatLog(`User ${data.username} has been ${data.hasBeenBlocked ? "blocked" : "unblocked"}.\n`);
	})

	/*
	Handles the disconnection of a user (removes the username from the list of currently connected users).
	*/
	socket.on("clientDisconnect", function(data){
		$("#" + data.username).remove();
	});

	/*
	Appends the plain text message to the chat log.
	*/
	socket.on("message",function(data){
		appendToChatLog(data + "\n");
	});

	/*
	This user has recieved a private message.
	*/
	socket.on("privateMessage", function(data){
		let response = prompt(`${data.username} says:\n\n${data.message}\n\nPlease enter your private response below:`);

		// Check if user wants to respond
		if(response){ sendPrivateMessage(socket, data.username, response); }
	});

	/*
	Fired by the server when some error occurs during a private message.
	Ex: Receiver has blocked this user, reciever has disconnected.
	*/
	socket.on("privateMessageError", function(data){
		alert(data);
	});

	// Handles the event when the enter key is pressed in the text input.
	$('#inputText').keypress(function(event){
			if(event.which === 13){ // Enter key pressed.
				let that = $(this);
				event.preventDefault(); //if any

				// Get text from input and empty it.
				let text = that.val();
				if(text.length === 0){
					return;
				}

				that.val("");

				// Send message
				socket.emit("message", text);
			}
	});

	/*
	Handles double click events.
	If the shift key is held down while double clicking, the selected user will be blocked,
	otherwise a private message prompt will open up.
	*/
	function userListItemDoubleClickHandler(event){
		let clickedUserName = this.id;

		if(event.shiftKey){ // User wants to block someone.
			socket.emit("blockUser", {username : clickedUserName});
		}
		else{ // User wants to send private message
			let message = prompt(`Please enter the message you wish to send to ${clickedUserName}: `);

			if(message){ // Check if user entered a message
				sendPrivateMessage(socket, clickedUserName, message);
			}
		}
	}
});

/*
Appends a message to the chat log in plain text, then scrolls to the bottom of the chat log.
*/
function appendToChatLog(message){
	let chatLog = $('#chatLog')[0];
	chatLog.append(message);
	scrollToBottomOfChatLog();
}

/*
Scrolls to the bottom of the chat log.
*/
function scrollToBottomOfChatLog(){
	let chatLog = $('#chatLog')[0];
	chatLog.scrollTop = chatLog.scrollHeight;
}

/*
Emits a private message to the socket specified.
The JSON object send consists of a username to send the message to and the actual message.
*/
function sendPrivateMessage(socket, recieverUsername, message){
	socket.emit("privateMessage", {
		username : recieverUsername,
		message : message
	});
}

/*
Prompts the user once for a username.
If a username is not entered, a random one will be chosen.

If a username is entered, it is validated (trimmed and compared to a regex),
if it is invalid then a random username is chosen.
If it is valid then that username is used.

Returns the username.
*/
function getUsername(){
	let username = prompt("Please enter a username below.\n\nA username can only contain characters, numbers, and underscore characters.");

	// User entered a username, validate it.
	if(username){
		username = username.trim();
		if(username.match(/^[\w_]+$/)){ // Username can only contain letters, numbers, or underscore characters
			return username; // Valid username
		}
		else{
			alert("Stop trying to break the system.\nGenerating random username\nI hope you like it...");
		}
	}

	// Invalid or not entered username, generate a random one.
	return generateRandomUsername();

	/*
	Returns a randomly generated username for when a user decides to not input one.
	The username is in the form:
	andjectiveNoun_X where X is some random integer.
	*/
	function generateRandomUsername(){
		const adjectives = ["brave", "gentle", "happy", "angry", "butthurt", "flustered", "lovely", "cool"];
		const nouns = ["Panda", "Platypus", "Penguin", "Tomato", "Banana", "Cucumber", "Keyboard", "Computer", "CPU"];

		let randomAdjective = adjectives[Math.floor(Math.random()*adjectives.length)];
		let randomNoun = nouns[Math.floor(Math.random()*nouns.length)];
		let randomID = Math.floor(Math.random()*100000);

		return randomAdjective + randomNoun + "_" + randomID;
	}
}
