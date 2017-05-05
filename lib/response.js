const util = require('util');
const EventEmitter = require('events');
const UdpSocket = require('dgram').Socket;
const TcpSocket = require('net').Socket;
const packet = require('nameserver-packet');

function Response() {
	if(!(this instanceof Response)) {
		return new Response;
	}
}

util.inherits(Response, EventEmitter);

module.exports = Response;

/**
 * Sends response in its current state to client
 * @param callback {function?} function called when response has been sent according to Node networking logic
 */
Response.prototype.send = function(callback = undefined) {
	if(callback !== undefined && callback !== 'function') {
		throw new Error('Callback must be a function')
	}

	const data = packet.serialize(this.packet);
	const socket = this.socket;

	if(socket instanceof UdpSocket) {
		const rinfo = this.rinfo;
		socket.send(data, rinfo.port, rinfo.address, e => {
			if(e) {
				if(callback) callback(e);
				else this.emit('error', e);
			} else {
				if(callback) callback(null);
			}
		});
		this.sent = true;
		this.emit('send');
	} else if(socket instanceof TcpSocket) {
		const lengthBuffer = new Buffer(2);
		lengthBuffer.writeUInt16BE(data.length);
		socket.write(lengthBuffer);
		socket.write(data, e => {
			if(e) {
				if(callback) callback(e);
				else this.emit('error', e);
			} else {
				if(callback) callback(null);
			}
		});
		this.sent = true;
		this.emit('send');
	} else {
		throw new Error('Could not determine connection type');
	}
};
