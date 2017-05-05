const debug = require('debug')('nameserver:index');
const packet = require('nameserver-packet');
const request = require('./request');
const response = require('./response');

/**
 * Validates question section of packet, throws on error
 * @param packet {object} packet to be validated
 */
function validate(packet) {
	if(packet.question.length !== 1) {
		throw new Error('Unsupported number of questions in request: ' + packet.question.length);
	}

	if(packet.question[0].class !== 'IN') {
		throw new Error('Unsupported question class: ' + packet.question[0].class);
	}
}

/**
 * Namserver
 * @returns {function} handler to be passed to UDP socket message event or TCP socket data event
 */
module.exports = function nameserver() {

	/**
	 * App constructor
	 * @param source {Buffer|Socket} buffer object from incoming UDP or TCP socket from TCP server
	 * @param rinfo {object?} UDP peer info
	 */
	function handler(source, rinfo) {

		const req = request();
		const res = response();

		if(arguments.length === 1) {

			req.socket = res.socket = source;

			let buffer, packetLength;

			source.on('data', b => {

				buffer = buffer ? Buffer.concat([buffer, b]) : b; // FIXME: this might be "slow"

				if(!packetLength) {
					if(buffer.length < 2) {
						return;
					}

					packetLength = buffer.readUInt16BE();
				}

				if(buffer.length >= packetLength + 2) {

					try {
						req.packet = packet.parse(buffer.slice(2, packetLength + 2));
						validate(req.packet);
						buffer = buffer.slice(packetLength);
						packetLength = undefined;
						debug('Incoming TCP request');
						handler.handle(req, res);
					} catch(e) {
						source.end();
						debug('Failed to process TCP request: ', e.message);
					}
				}
			});

			source.on('close', () => {
				debug('TCP connection has been closed');
			});
		} else {

			req.socket = res.socket = this;
			req.rinfo = res.rinfo = rinfo;

			try {
				req.packet = packet.parse(source);
				validate(req.packet);
				debug('Incoming UDP request');
				handler.handle(req, res);
			} catch(e) {
				debug('Failed to process UDP request: ', e.message);
			}
		}
	}

	Object.setPrototypeOf(handler, handlerProto);

	/**
	 * Middleware chain
	 */
	handler._middlewares = [];

	return handler;
};

const handlerProto = Object.create(Function.prototype);

handlerProto.use = function use(name, type, fn) {
	if(arguments.length === 2) {
		fn = type;
		type = '';
	} else if(arguments.length === 1) {
		fn = name;
		type = '';
		name = '';
	}

	if(typeof fn !== 'function') {
		throw new Error('Callback must be function');
	}

	if(typeof name !== 'string' || typeof type !== 'string') {
		throw new Error('RR name and type must be strings');
	}

	const handlesError = fn.length > 3;
	const zone = name ? name.split('.').reverse() : [ ]; // e.g. [ "com", "example", "www" ]
	const zoneLength = zone.length;

	function match(qzone, qtype, hasError) {
		if(Boolean(hasError) !== handlesError) {
			return null;
		}

		if(type && type !== qtype) {
			return null;
		}

		if(qzone.length < zoneLength) {
			return null;
		}

		const vars = {};

		for(let i = 0; i < zoneLength; i++) {
			if(zone[i][0] === ':') {
				vars[zone[i].slice(1)] = qzone[i];
			} else if(zone[i] !== qzone[i]) {
				return null;
			}
		}

		return vars;
	}

	this._middlewares.push({ match, fn, zoneLength });
};

for(const rrtype in packet.Type) {
	if(packet.Type.hasOwnProperty(rrtype)) {
		if(typeof packet.Type[rrtype] === 'number') {
			void function() {
				const type = rrtype;
				handlerProto[rrtype.toLowerCase()] = function(name, fn) {

					if(typeof fn !== 'function') {
						throw new Error('Callback must be function');
					}

					if(typeof name !== 'string') {
						throw new Error('RR name must be string');
					}

					const handlesError = fn.length > 3;
					const zone = name.split('.').reverse(); // e.g. [ "com", "example", "www" ]
					const zoneLength = zone.length;

					function match(qzone, qtype, hasError) {
						if(Boolean(hasError) !== handlesError) {
							return null;
						}

						if(type !== 'all' && type !== qtype) {
							return null;
						}

						if(qzone.length !== zoneLength) {
							return null;
						}

						const vars = {};

						for(let i = 0; i < zoneLength; i++) {
							if(zone[i][0] === ':') {
								vars[zone[i].slice(1)] = qzone[i];
							} else if(zone[i] !== qzone[i]) {
								return null;
							}
						}

						return vars;
					}

					this._middlewares.push({ match, fn, zoneLength });
				}
			}();
		}
	}
}

handlerProto.handle = function handle(req, res) {

	req.question = JSON.parse(JSON.stringify(req.packet.question[0]));
	req.qname = req.packet.question[0].name;
	req.qtype = req.packet.question[0].type;
	req.qclass = req.packet.question[0].class;

	res.packet = {
		id: req.packet.id,
		opcode: req.packet.opcode,
		response: true,
		authoritative: false,
		recursionDesired: req.packet.recursionDesired,
		recursionAvailable: false,
		authenticated: false,
		checkingDisabled: false,
		rcode: 0, // OK by default
		question: JSON.parse(JSON.stringify(req.packet.question)),
		answer: [],
		authority: [],
		additional: []
	};

	req.zone = req.qname.split('.').reverse(); // e.g. [ "com", "example", "www" ]

	const middlewareIterator = this._middlewares[Symbol.iterator]();
	var error = null;

	const next = e => {

		if(res.sent) {
			// response has already been sent
			return;
		}

		if(e) {
			error = e;
		}

		var params, middleware;
		do {
			const nextMiddleware = middlewareIterator.next();
			if(nextMiddleware.done) {
				if(error) {
					debug('Unhandler error: ', error);
				}
				// no more middlewares, send result
				// TODO: encapsulate following code into function
				res.send();
				return;
			}
			if(params = nextMiddleware.value.match(req.zone, req.qtype, Boolean(error))) {
				middleware = nextMiddleware.value;
			}
		} while(!params);

		req.subzone = req.zone.slice(middleware.zoneLength);
		req.params = params;

		if(error) {
			middleware.fn.call(this, error, req, res, next);
		} else {
			middleware.fn.call(this, req, res, next);
		}
	};

	next();
};

