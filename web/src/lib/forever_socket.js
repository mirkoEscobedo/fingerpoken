function ExponentialBackoff(initial, maximum) {
  this.initial = initial;
  this.maximum = maximum;
  this.count = 0
}

ExponentialBackoff.prototype.nextDuration = function() {
  this.count += 1;
  return Math.pow(this.initial, 1.1 * this.count);
}

function ForeverSocket(websocket_url, protocols) {
  this.url = websocket_url;
  this.protocols = protocols || "";
  this.connect();
  this.pending = [];
}

ForeverSocket.prototype.send = function(message, callback) {
  if (this.websocket === undefined || this.websocket.readyState != 1) {
    // Queue it up
    this.pending.push([message, callback])
  } else {
    // Ready, send now.
    if (callback !== null && callback !== undefined) {
      this.setMessageHandler(callback);
    }
    if (message instanceof Array) {
      for (i in message) {
        this.websocket.send(message[i]);
      }
    } else {
      this.websocket.send(message);
    }
  }
}

ForeverSocket.prototype.connect = function() {
  this.websocket = new WebSocket(this.url, this.protocols);
  this.registerHandlers(this.websocket)
}

ForeverSocket.prototype.close = function() {
  if (this.websocket !== undefined) {
    this.websocket.onclose = undefined; // stop autoreconnecting
    this.websocket.onerror = undefined; // stop autoreconnecting
  }
  if (this.reconnectTimer !== undefined) {
    clearTimeout(this.reconnectTimer);
  }
}

ForeverSocket.prototype.registerHandlers = function(socket) {
  var self = this;
  socket.onopen = function(e) { self.handleOpen(e) };
  socket.onclose = function(e) { self.handleClose(e) };
  socket.onerror = function(e) { self.handleError(e) };
  socket.onmessage = function(e) { self.handleMessage(e) };
}

ForeverSocket.prototype.handleOpen = function(e) { 
  console.log("Websocket connected: " + this.url);
  if (this.pending.length > 0) {
    next = this.pending.pop()
    this.send(next[0], next[1])
  }

  if (this.connectedHandler === null || this.connectedHandler === undefined) {
    return;
  }
  this.connectedHandler(this);
}

ForeverSocket.prototype.handleClose = function(e) { 
  this.websocket = undefined;

  var self = this;
  this.reconnectTimer = setTimeout(function() { self.connect(); }, 400);
}

ForeverSocket.prototype.handleError = function(e) { 
  this.websocket = undefined;
}

ForeverSocket.prototype.handleMessage = function(e) { 
  if (this.messageHandler === null || this.messageHandler === undefined) {
    return;
  }
  this.messageHandler(e);
}

ForeverSocket.prototype.setMessageHandler = function(callback) {
  this.messageHandler = callback;
};

ForeverSocket.prototype.setConnectedHandler = function(callback) {
  this.connectedHandler = callback;
};

module.exports = ForeverSocket;
