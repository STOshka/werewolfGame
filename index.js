var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var animal = require('animal-id');
app.get('/', function(req, res){
  res.sendfile('index.html');
});


var newPlayerId = 0;
var players = [];
var gameState = new gameState();
var gamePhases = {
	SETUP : 'setup',
	NIGHT : 'night',
	DAY : 'day',
	ENDED : 'ended' 
}

var gamePhase = gamePhases.SETUP;
var roles = {
    WEREWOLF : 'werewolf',
	MASON : 'mason',
    SEER : 'seer',
	ROBBER : 'robber',
	TROUBLEMAKER : 'troublemaker',
	DRUNK : 'drunk',
	INSOMNIAC : 'insomniac',
	VILLAGER : 'villager',
	TANNER : 'tanner',
	HUNTER : 'hunter'
}

var playerActions = {
	DONOTHING : 'donothing',
	VIEW : 'view',
	SWAP : 'swap',
	VIEWANDSWAP : 'viewandswap'
}


io.on('connection', function(socket){
  var socketId = socket.id;

  players.push(new playerState(socketId));
  
  //push the initial set of buttons
  
  //io.sockets.connected[socketId].emit('update gamebuttons', 'test');
	
  socket.on('chat message', function(msg){
    processChatMessage(msg, socketId);
  });
  
  socket.on('disconnect', function(){
	  var removedPlayer = removePlayer(socketId);
	  console.log('removed player', removedPlayer); 
  });  
  
});

//todo i know this is bad practice. Ask a javascript person how to do this better
var setupHTML = "";

http.listen(3000, function(){
  console.log('listening on *:3000');
});


//define player variables
function playerState(socket) {
	//sets color to a random color
	this.playerNameColor = '#' + Math.random().toString(16).substring(2, 8);
	this.playerSocket = socket;
	this.playerNumber = newPlayerId;
	newPlayerId += 1;
	this.playerUserName = animal.getId();
	this.playerInitialRole = roles.VILLAGER;
	this.playerCurrentRole = roles.VILLAGER;
	this.playerAction;
	this.playerTokens = [];
	this.playerCurrentVote = players.length - 1;
};

function gameState() {
	this.roles = [];
	//game time in seconds
	this.timer = 300;	
	//middle cards have position 0, 1, 2
	this.middleCards = [];
}

function playerAction(inputAction, inputTargetGroup, inputTarget) {
	this.action = inputAction;
	//possible values are player or middle
	this.targetGroup = inputTargetGroup;
	//target is the index(indecies) of the player(s) or middle card(s). example [1 2]
	this.target = inputTarget;
}

//Shuffles and assigns roles
function setupGame() {
	if(!(gamePhase == gamePhases.SETUP || gamePhase == gamePhases.ENDED)) {
		io.emit('chat game message', 'Game is not in the correct state to setup the game');
	}
	if(gameState.roles.length != players.length + 3) {
		io.emit('chat game message', 'not enough players! ' + gameState.roles.length + ' roles and ' + players.length + ' players.')
		return;
	}
	shuffle(gameState.roles);
	
	gameState.middleCards = gameState.roles.slice(0,3)
	for(var i = 0; i < players.length; i++) {
		players[i].playerInitialRole = gameState.roles[i+3];
		players[i].playerCurrentRole = gameState.roles[i+3];
	}
	
	gamePhase = gamePhases.SETUP;
	
	startNight();
}

//Privately messages each player their role and action
function startNight(){
	if(gamePhase != gamePhases.SETUP) {
		io.emit('chat game message', 'Game is not in the correct state to start the night');
	}
	
	gamePhase = gamePhases.NIGHT;
	
	for(var i = 0; i < players.length; i++) {
		var currentPlayerIndex = i;
		var currentPlayer = players[currentPlayerIndex];
		io.sockets.connected[currentPlayer.playerSocket].emit('clear gamebuttons');
		var currentPlayerInitialRole = currentPlayer.playerInitialRole;
		io.sockets.connected[currentPlayer.playerSocket].emit('chat game message', 'you are a '.concat(currentPlayerInitialRole));
		if(currentPlayerInitialRole.localeCompare(roles.WEREWOLF) == 0) {
			var werewolves = findPlayerIndexByInitialRole(roles.WEREWOLF);
			var werewolvesNames = [];
			if(werewolves.length == 0) {
				console.log('error state. there should be at least one werewolf');
			}
			else if(werewolves.length == 1) {
				io.sockets.connected[currentPlayer.playerSocket].emit('chat game message', 'You are alone. Look at one of the middle cards (see right panel).');
				io.sockets.connected[currentPlayer.playerSocket].emit('update gamebuttons seemiddle', 'werewolf', '1');
			}
			else {
				currentPlayer.playerAction = new playerAction(playerActions.VIEW, 'player', werewolves);
				io.sockets.connected[currentPlayer.playerSocket].emit('chat game message', 'You are a pack. You will see the other werewolf at the end of the timer.');
			}
		}
		
		else if(currentPlayerInitialRole.localeCompare(roles.MASON) == 0) {
			var masons = findPlayerIndexByInitialRole(roles.MASON);
			currentPlayer.playerAction = new playerAction(playerActions.VIEW, 'player', masons);
			io.sockets.connected[currentPlayer.playerSocket].emit('chat game message', 'You will see the other mason at the end of the timer.');
		}
		
		else if(currentPlayerInitialRole.localeCompare(roles.SEER) == 0) {
			io.sockets.connected[currentPlayer.playerSocket].emit('chat game message', 'Look at two cards in the middle, or one card from another player (see right panel).');
			io.sockets.connected[currentPlayer.playerSocket].emit('update gamebuttons seemiddle', 'seer', '2');
			io.sockets.connected[currentPlayer.playerSocket].emit('update gamebuttons seeplayers', 'seer', '1', getAllPlayerNames().join(' '));
		}
		
		else if(currentPlayer.playerInitialRole.localeCompare(roles.ROBBER) == 0) {
			io.sockets.connected[currentPlayer.playerSocket].emit('chat game message', 'Choose one person to rob (see right panel).');
			io.sockets.connected[currentPlayer.playerSocket].emit('update gamebuttons seeplayers', 'robber', '1', getAllPlayerNames().join(' '));
		}
		
		else if(currentPlayer.playerInitialRole.localeCompare(roles.TROUBLEMAKER) == 0) {
			io.sockets.connected[currentPlayer.playerSocket].emit('chat game message', 'Choose two people to swap roles (see right panel).');
			io.sockets.connected[currentPlayer.playerSocket].emit('update gamebuttons seeplayers', 'troublemaker', '2', getAllPlayerNames().join(' '));
		}
		
		else if(currentPlayer.playerInitialRole.localeCompare(roles.DRUNK) == 0) {
			io.sockets.connected[currentPlayer.playerSocket].emit('chat game message', 'Choose one middle card to take (see right panel).');
			io.sockets.connected[currentPlayer.playerSocket].emit('update gamebuttons seemiddle', 'drunk', '1');
		}
		
		else if(currentPlayer.playerInitialRole.localeCompare(roles.INSOMNIAC) == 0) {
			currentPlayer.playerAction = new playerAction(playerActions.VIEW, 'player', [currentPlayerIndex]);
		}
		
		//villager, hunter, tanner
		else {
			currentPlayer.playerAction = new playerAction(playerActions.DONOTHING, 'player', []);
		}	
	}
	//in 30 seconds execute the actions
	io.emit('start timer', 30);
	//5 seconds of buffer, because of network lag
	setTimeout(function() {finishNight();}, 35000);
}

//defines how the night is resolved
function finishNight() {
	var werewolves = findPlayerIndexByInitialRole(roles.WEREWOLF);
	var masons = findPlayerIndexByInitialRole(roles.MASON);
	var seer = findPlayerIndexByInitialRole(roles.SEER);
	var robber = findPlayerIndexByInitialRole(roles.ROBBER);
	var troublemaker = findPlayerIndexByInitialRole(roles.TROUBLEMAKER);
	var drunk = findPlayerIndexByInitialRole(roles.DRUNK);
	var insomniac = findPlayerIndexByInitialRole(roles.INSOMNIAC);

	for(var i = 0; i < werewolves.length; i++) {
		performAction(players[werewolves[i]]);
		console.log('werewolf performed its action', players[werewolves[i]].playerAction);
	}
	for(var i = 0; i < masons.length; i++) {
		performAction(players[masons[i]]);
		console.log('masons performed its action', players[masons[i]].playerAction);
	}
	for(var i = 0; i < seer.length; i++) {
		performAction(players[seer[i]]);
		console.log('seer performed its action', players[seer[i]].playerAction);
	}
	for(var i = 0; i < robber.length; i++) {
		performAction(players[robber[i]]);
		console.log('robber performed its action', players[robber[i]].playerAction);
	}
	for(var i = 0; i < troublemaker.length; i++) {
		performAction(players[troublemaker[i]]);
		console.log('troublemaker performed its action', players[troublemaker[i]].playerAction);
	}
	for(var i = 0; i < drunk.length; i++) {
		performAction(players[drunk[i]]);
		console.log('drunk performed its action', players[drunk[i]].playerAction);
	}
	for(var i = 0; i < insomniac.length; i++) {
		performAction(players[insomniac[i]]);
		console.log('insomniac performed its action', players[insomniac[i]].playerAction);
	}
	
	gamePhase = gamePhases.DAY;
	io.emit('start timer', gameState.timer);
	io.emit('clear gamebuttons');
	io.emit('update gamebuttons daytime', getAllPlayerNames().join(' '));
	var gameTimeInMilliseconds = (gameState.timer + 5) * 1000 ;
	setTimeout(function() {finishDay();}, gameTimeInMilliseconds);
	
}

function finishDay() {
	var votedPlayers = []; 
	for(var i = 0; i < players.length; i++) {
		var currentPlayer = players[i];
		var endStateString = ''; 
		endStateString = endStateString.concat(currentPlayer.playerUserName, ' started out as a ', currentPlayer.playerInitialRole);
		endStateString = endStateString.concat(', ended as a ', currentPlayer.playerCurrentRole);
		if(currentPlayer.playerCurrentVote < 0) {
			currentPlayer.playerCurrentVote += players.length;
		}
		var votedPlayer = currentPlayer.playerCurrentVote;
		endStateString = endStateString.concat(' and voted for ', players[votedPlayer].playerUserName, '.');
		io.emit('chat game message', endStateString);
		
		if(!votedPlayers[votedPlayer]) {
			votedPlayers[votedPlayer] = 0;
		}
		votedPlayers[votedPlayer]++;
	}
	printWinners(votedPlayers);

	gamePhase = gamePhases.SETUP;
}

function printWinners(votedPlayers) {
	//Count the highest number voted. If one, nobody died.
	var max = 0;
	for(var i = 0; i < votedPlayers.length; i++) {
		if(votedPlayers[i] > max) {
			max = votedPlayers[i];
		}
	}
	//If one, nobody died. Town wins if no werewolves.
	var werewolves = findPlayerIndexByCurrentRole(roles.WEREWOLF);
	if(max == 1) {
		if(werewolves.length > 0) {
			io.emit('chat game message', 'Nobody died but there were werewolves. Werewolves win!');
		}
		else {
			io.emit('chat game message', 'Nobody died, and there were no werewolves. Town wins!');
		}
	}
	else {
		//Also kill hunter's target if they were killed.
		var hunter = findPlayerIndexByCurrentRole(roles.HUNTER);
		for(var i = 0; i < hunter.length; i++) {
			if(votedPlayers[hunter[i]] == max) {
				votedPlayers[players[hunter[i]].playerCurrentVote] = max;
			}
		}
		
		//If tanner dies, tanner wins.
		var tanner = findPlayerIndexByCurrentRole(roles.TANNER);
		for(var i = 0; i < tanner.length; i++) {
			if(votedPlayers[tanner[i]] == max) {
				io.emit('chat game message', 'Tanner died. ' + players[tanner[i]].playerUserName + ' wins!');
				return;
			}
		}

		//If a werewolf died, town wins.
		for(var i = 0; i < werewolves.length; i++) {
			if(votedPlayers[werewolves[i]] == max) {
				io.emit('chat game message', 'Werewolf (' + players[werewolves[i]].playerUserName + ') died. Town wins!');
				return;
			}
		}

		//Otherwise, werewolves win.
		io.emit('chat game message', 'No werewolves died. Werewolves win.');
	}
}

function performAction(currentPlayer) {
	var playerAction = currentPlayer.playerAction;
	//SEER, MASON, WEREWOLVES, INSOMNIAC, 
	if(playerAction.action.localeCompare(playerActions.VIEW) == 0) {
		var outputMessage = '';
		if(playerAction.targetGroup.localeCompare('player') == 0) {
			for(var i = 0; i < playerAction.target.length; i++) {
				var targetPlayer = players[playerAction.target[i]];
				outputMessage = outputMessage.concat(targetPlayer.playerUserName, ' is a ', targetPlayer.playerCurrentRole, '. ');
			}
		}
		else {
			for(var i = 0; i < playerAction.target.length; i++) {
				var targetCard = gameState.middleCards[playerAction.target[i]];
				outputMessage = outputMessage.concat('The ', playerAction.target[i], ' middle card is a ', targetCard, '. ');
			}		
		}
		io.sockets.connected[currentPlayer.playerSocket].emit('chat game message', outputMessage);
	}
	else if(playerAction.action.localeCompare(playerActions.SWAP) == 0) {
		var outputMessage = '';
		if(playerAction.target.length != 2) {
			console.log('ERROR STATE. SWAPPING WITHOUT TWO PEOPLE IN THE TARGET');
		}
		//TROUBLEMAKER
		if(playerAction.targetGroup.localeCompare('player') == 0) {
			var targetPlayerZero = players[playerAction.target[0]];
			var targetPlayerOne = players[playerAction.target[1]];
			var outputMessage = '';

			var tempRole = targetPlayerOne.playerCurrentRole;
			targetPlayerOne.playerCurrentRole = targetPlayerZero.playerCurrentRole;
			targetPlayerZero.playerCurrentRole = tempRole;
			
			outputMessage = outputMessage.concat(' Swapped ', targetPlayerZero.playerUserName, ' and ', targetPlayerOne.playerUserName, '. ');			
		}
		//DRUNK
		else {
			if(playerAction.target.length != 1) {
				console.log('ERROR STATE. SWAPPING WITHOUT ONE MIDDLE CARD IN TARGET');
			}
			
			var outputMessage = '';
			var targetCard = gameState.middleCards[playerAction.target[0]];
			var tempRole = targetCard;
			targetCard = currentPlayer.playerCurrentRole;
			currentPlayer.playerCurrentRole = tempRole;
			outputMessage = outputMessage.concat('You swapped with the ', playerAction.target[0], ' middle card.');
		}
		io.sockets.connected[currentPlayer.playerSocket].emit('chat game message', outputMessage);
	}
	//ROBBER
	else if(playerAction.action.localeCompare(playerActions.VIEWANDSWAP) == 0) {
		var outputMessage = '';
		if(playerAction.target.length != 1) {
			console.log('ERROR STATE. SWAPPING YOURSELF WITHOUT A TARGET');
		}
		
		if(playerAction.targetGroup.localeCompare('player') == 0) {
			var targetPlayerZero = players[playerAction.target[0]];
			
			var tempRole = currentPlayer.playerCurrentRole;
			currentPlayer.playerCurrentRole = targetPlayerZero.playerCurrentRole;
			targetPlayerZero.playerCurrentRole = tempRole;
			
			outputMessage = outputMessage.concat(' Swapped ', targetPlayerZero.playerUserName, ' with yourself. You are now a ', currentPlayer.playerCurrentRole, '. ');			
		}
		//NO ONE YET
		else {
			if(playerAction.target.length != 1) {
				console.log('ERROR STATE. SWAPPING WITHOUT ONE MIDDLE CARD IN TARGET');
			}
			
			var targetCard = gameState.middleCards[playerAction.target[0]];
			var tempRole = targetCard;
			targetCard = currentPlayer.playerCurrentRole;
			currentPlayer.playerCurrentRole = tempRole;
			outputMessage = outputMessage.concat('You swapped with the ', playerAction.target[0], ' middle card. You are now a ', currentPlayer.playerCurrentRole, '. ');
		}
		io.sockets.connected[currentPlayer.playerSocket].emit('chat game message', outputMessage);
	}
	else if(playerAction.action.localeCompare(playerActions.DONOTHING) == 0) {
		io.sockets.connected[currentPlayer.playerSocket].emit('chat game message', 'You did nothing');
	}
}

function processChatMessage(msg, socketId) {
	var currentPlayerIndex = findPlayerIndex(socketId);
	var messageParts = msg.split(' ');
	var command = messageParts[0];
	var helpText = 'Possible commands, username [username without spaces]'
	
	
	//global chat commands
	if(command.localeCompare('playerstate') == 0) {
		console.log('playerstate', players);
		//io.emit('chat message', players);
	}	
	
	else if(command.localeCompare('gamestate') == 0) {
		console.log('gameState', gameState);
		//io.emit('chat message', players);
	}
	
	else if(command.localeCompare('help') == 0) {
		io.sockets.connected[socketId].emit('chat message', 'this is help text');
	}
	
	else if(command.localeCompare('roles') == 0) {
		var newRoles = messageParts.slice(1);
		gameState.roles = newRoles;
		io.emit('chat message', 'roles have been set to '.concat(gameState.roles, ' by ', players[currentPlayerIndex].playerUserName));
	}
	
	else if(command.localeCompare('timer') == 0) {
		gameState.timer = messageParts[1];
		io.emit('chat message', 'timer has been set to '.concat(gameState.timer, ' seconds by ', players[currentPlayerIndex].playerUserName));
	}
	
	else if(command.localeCompare('setupgame') == 0) {
		setupGame();
	}
	
	//role specific chat commands
	
	else if(command.localeCompare('werewolf') == 0) {
		var currentPlayer = players[currentPlayerIndex];
		if(gamePhase.localeCompare(gamePhases.NIGHT) != 0) {
			io.sockets.connected[currentPlayer.playerSocket].emit('chat message', 'You cannot perform a werewolf action outside of the night phase');
			return;
		}
		
		if(currentPlayer.playerInitialRole.localeCompare(roles.WEREWOLF) != 0) {			
			io.sockets.connected[currentPlayer.playerSocket].emit('chat message', 'You are not the werewolf. You are the ' + currentPlayer.playerInitialRole);
			return;
		}
		
		var numWerewolves = findPlayerIndexByInitialRole(roles.WEREWOLF).length;
		
		var outputMessage;
		var middleIndex = [];
		middleIndex[0] = messageParts[2];
		if(gameState.middleCards[messageParts[2]].localeCompare(roles.WEREWOLF) == 0) {
			console.log('werewolf saw a werewolf');
			middleIndex[0] = (middleIndex[0] + 1) % 3;
			io.sockets.connected[currentPlayer.playerSocket].emit('chat game message', 'wow you picked a werewolf. look at this card instead.');
		}
		currentPlayer.playerAction = new playerAction(playerActions.VIEW, 'middle', middleIndex);
		io.sockets.connected[currentPlayer.playerSocket].emit('chat game message', 'You are going to see this middle card '.concat(middleIndex[0]));
	}
	
	else if(command.localeCompare('seer') == 0) {
		var currentPlayer = players[currentPlayerIndex];
		if(gamePhase.localeCompare(gamePhases.NIGHT) != 0) {
			io.sockets.connected[currentPlayer.playerSocket].emit('chat message', 'You cannot perform a seer action outside of the night phase');
			return;
		}
		
		if(currentPlayer.playerInitialRole.localeCompare(roles.SEER) != 0) {			
			io.sockets.connected[currentPlayer.playerSocket].emit('chat message', 'You are not the seer. You are the ' + currentPlayer.playerInitialRole);
			return;
		}
		
		var outputMessage;
		if(messageParts[1].localeCompare('middle') == 0) {	
			currentPlayer.playerAction = new playerAction(playerActions.VIEW, 'middle', [messageParts[2], messageParts[3]]);
			outputMessage = 'you are going to see cards '.concat(messageParts[2], messageParts[3]);
		}
		else {
			if(findPlayerIndexByName(messageParts[1]) == currentPlayerIndex) {
				outputMessage = 'please don\'t look at yourself';
			}
			else {
				currentPlayer.playerAction = new playerAction(playerActions.VIEW, 'player', [findPlayerIndexByName(messageParts[1])]);
				outputMessage = 'you are going to see player '.concat(messageParts[1]);
			}
		}
		io.sockets.connected[currentPlayer.playerSocket].emit('chat game message', outputMessage);
	}
	
	else if(command.localeCompare('robber') == 0) {
		var currentPlayer = players[currentPlayerIndex];
		if(gamePhase.localeCompare(gamePhases.NIGHT) != 0) {
			io.sockets.connected[currentPlayer.playerSocket].emit('chat message', 'You cannot perform a robber action outside of the night phase');
			return;
		}
		
		if(currentPlayer.playerInitialRole.localeCompare(roles.ROBBER) != 0) {			
			io.sockets.connected[currentPlayer.playerSocket].emit('chat message', 'You are not the robber. You are the ' + currentPlayer.playerInitialRole);
			return;
		}
		
		var outputMessage;
		if(messageParts[1].localeCompare('none') == 0) {
			currentPlayer.playerAction = new playerAction(playerActions.DONOTHING, 'player', []);
			outputMessage = 'you will do nothing';
		}
		else {	
			if(findPlayerIndexByName(messageParts[1]) == currentPlayerIndex) {
				outputMessage = 'please don\'t rob at yourself';
			}
			else {
				currentPlayer.playerAction = new playerAction(playerActions.VIEWANDSWAP, 'player', [findPlayerIndexByName(messageParts[1])]);			
				outputMessage = 'you will swap with player '.concat(messageParts[1]);
			}
		}
		io.sockets.connected[currentPlayer.playerSocket].emit('chat game message', outputMessage);		
	}
	
	else if(command.localeCompare('troublemaker') == 0) {
		var currentPlayer = players[currentPlayerIndex];
		if(gamePhase.localeCompare(gamePhases.NIGHT) != 0) {
			io.sockets.connected[currentPlayer.playerSocket].emit('chat message', 'You cannot perform a troublemaker action outside of the night phase');
			return;
		}
		
		if(currentPlayer.playerInitialRole.localeCompare(roles.TROUBLEMAKER) != 0) {			
			io.sockets.connected[currentPlayer.playerSocket].emit('chat message', 'You are not the troublemaker. You are the ' + currentPlayer.playerInitialRole);
			return;
		}
		
		var outputMessage;
		if(messageParts[1].localeCompare('none') == 0) {
			currentPlayer.playerAction = new playerAction(playerActions.DONOTHING, 'player', []);
			outputMessage = 'You will do nothing';
		}
		else {	
			if(findPlayerIndexByName(messageParts[1]) == currentPlayerIndex || findPlayerIndexByName(messageParts[2]) == currentPlayerIndex) {
				outputMessage = 'please don\'t troublemake at yourself';
			}
			else {
				currentPlayer.playerAction = new playerAction(playerActions.SWAP, 'player', [findPlayerIndexByName(messageParts[1]), findPlayerIndexByName(messageParts[2])]);			
				outputMessage = 'You are going to swap '.concat(messageParts[1], ' and ', messageParts[2]);
			}
		}
		io.sockets.connected[currentPlayer.playerSocket].emit('chat game message', outputMessage);
	}
	
	else if(command.localeCompare('drunk') == 0) {
		var currentPlayer = players[currentPlayerIndex];
		if(gamePhase.localeCompare(gamePhases.NIGHT) != 0) {
			io.sockets.connected[currentPlayer.playerSocket].emit('chat message', 'You cannot perform a drunk action outside of the night phase');
			return;
		}
		
		if(currentPlayer.playerInitialRole.localeCompare(roles.DRUNK) != 0) {			
			io.sockets.connected[currentPlayer.playerSocket].emit('chat message', 'You are not the drunk. You are the ' + currentPlayer.playerInitialRole);
			return;
		}
		
		currentPlayer.playerAction = new playerAction(playerActions.SWAP, 'middle', [messageParts[1]]);			
		
		io.sockets.connected[currentPlayer.playerSocket].emit('chat message', 'You game swapped with the middle card in the '.concat(messageParts[1], 'position'));
	}
	
	//player chat commands
	
	else if(command.localeCompare('username') == 0) {
		var logMessage = players[currentPlayerIndex].playerUserName.concat(' has changed name to ', messageParts[1]);
		players[currentPlayerIndex].playerUserName = messageParts[1];
		io.emit('chat message', logMessage);	
	}
	
	else if(command.localeCompare('players') == 0) {
		io.sockets.connected[currentPlayer.playerSocket].emit('chat message', 'The players are: '.concat(getAllPlayerNames));	
	}
	
	else if(command.localeCompare('whoami') == 0) {
		io.sockets.connected[currentPlayer.playerSocket].emit('chat message', 'You are '.concat(players[currentPlayerIndex].playerUserName));
	}
	
	else if(command.localeCompare('vote') == 0) {
		var currentPlayer = players[currentPlayerIndex];
		var votedPlayerIndex = findPlayerIndexByName(messageParts[1]);
		if(votedPlayerIndex < 0) {
			io.sockets.connected[currentPlayer.playerSocket].emit('chat message', 'You typed in a name wrong. Try again.');			
		}
		if(votedPlayerIndex == currentPlayerIndex) {
			io.sockets.connected[currentPlayer.playerSocket].emit('chat message', 'Please don\'t vote for yourself');
		}
		else {		
			currentPlayer.playerCurrentVote = votedPlayerIndex;
			io.sockets.connected[currentPlayer.playerSocket].emit('chat game message', 'You are now voting for '.concat(players[votedPlayerIndex].playerUserName));
		}
	}
	
	else {
		io.emit('chat message', players[currentPlayerIndex].playerUserName.concat(': ' + msg));
	}
}

//returns removed player
function removePlayer(socketId) {
  return players.splice(findPlayerIndex(socketId), 1);
}

function findPlayerIndex(socketId) {
	for(var i = 0; i < players.length; i++) {
		if(players[i].playerSocket == socketId) {
			return i;
		}
	}
}

//copied from stack overflow http://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-a-javascript-array
function shuffle(array) {
  var currentIndex = array.length, temporaryValue, randomIndex ;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}

function findPlayerIndexByInitialRole(role) {
	var hits = [];
	for(var i = 0; i < players.length; i++) {
		if(players[i].playerInitialRole == role) {
			hits.push(i);
		}
	}
	return hits;
}

function findPlayerIndexByCurrentRole(role) {
	var hits = [];
	for(var i = 0; i < players.length; i++) {
		if(players[i].playerCurrentRole == role) {
			hits.push(i);
		}
	}
	return hits;
}

function getAllPlayerNames() {
	var names = [];
	for(var i = 0; i < players.length; i++) {
		names.push(players[i].playerUserName);
	}
	return names;
}

//returns -1 if cant find
function findPlayerIndexByName(name) {
	for(var i = 0; i < players.length; i++) {
		if(players[i].playerUserName == name) {
			return i;
		}
	}
	return -1;
}
