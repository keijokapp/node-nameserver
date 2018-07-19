const debug = require('debug')('nameserver:index');
const packet = require('nameserver-packet');
const request = require('./request');
const response = require('./response');


class Layer {
	constructor(host, fn) {
		this.handle = fn;
		this.name = fn.name || '<anonimous>';
		this.params = undefined;
		this.host = host;
	}

	handle_error(error, req, res, next) {
		const fn = this.handle;

		if(fn.length !== 4) {
			return next(error);
		}

		try {
			// not a standard error handler
			fn(error, req, res, next);
		} catch(err) {
			next(err);
		}
	}

	handle(req, res, next) {
		const fn = this.handle;

		if(fn.length > 3) {
			// not a standard request handler
			return next();
		}

		try {
			fn(req, res, next);
		} catch(err) {
			next(err);
		}
	}

	match(host) {
		const params = {};
		for(let i = 0; i < zone.length; i++) {
			if(zone[i][0] === ':') {
				params[zone[i].slice(1)] = qzone[i];
			} else if(zone[i] !== qzone[i]) {
				return false;
			}
		}
		this.host = host;
		this.params = params;
		return true;
	}
}


class Host {
	constructor(zone) {
		this.zone = zone;
		this.stack = [];
		this.rrtypes = {};
	}

	_handles_rrtype(rrtype) {
		if(this.rrtypes._all) {
			return true;
		}
		const name = rrtype.toLowerCase();
		return Boolean(this.methods[name]);
	};

	dispatch(req, res, done) {
		let idx = 0;
		const stack = this.stack;
		if(stack.length === 0) {
			return done();
		}

		const qtype = req.qtype.toLowerCase();

		req.host = this;

		next();

		function next(err) {
			// signal to exit host
			if(err && err === 'host') {
				return done();
			}

			// signal to exit zone
			if(err && err === 'zone') {
				return done(err)
			}

			const layer = stack[idx++];
			if(!layer) {
				return done(err);
			}

			if(layer.rrtype && layer.rrtype !== qtype) {
				return next(err);
			}

			if(err) {
				layer.handle_error(err, req, res, next);
			} else {
				layer.handle_request(req, res, next);
			}
		}
	}

	all(...handles) {
		for(const handle of handles) {
			if(typeof handle !== 'function') {
				throw new TypeError('Host.all() requires a callback function but got a ' + toString.call(handle));
			}
			const layer = new Layer('.', handle);
			layer.rrtype = undefined;
			this.rrtypes._all = true;
			this.stack.push(layer);
		}
		return this;
	}
}


Object.keys(packet.Type).forEach(rrtype => {
	if(typeof packet.Type[rrtype] === 'number') {
		Host[rrtype.toLowerCase()] = function(...handles) {
			for(const handle of handles) {
				if(typeof handle !== 'function') {
					throw new Error('Host.' + rrtype + '() requires a callback function but got a ' + toString.call(handle));
				}
				const layer = Layer('.', handle);
				layer.ttype = rrtype;
				this.rrtypes[rrtype] = true;
				this.stack.push(layer);
			}
			return this;
		};
	}
});


class Zone {
	constructor() {
		this.params = {};
		this.mergeParams = opts.mergeParams;
		this.stack = [];
	}

	handle(req, res, out) {
		const stack = this.stack;
		const parentParams = req.params;
		const done = restore(out, req, 'next', 'params');
		let idx = 0;
		req.next = e => {
			let layerError = e === 'host' ? null : e;

			// signal to exit zone
			if(layerError === 'zone') {
				setImmediate(done, null);
				return;
			}

			// no more matching layers
			if(idx >= stack.length) {
				setImmediate(done, layerError);
				return;
			}

			const path = req.path;
			if(path == null) {
				return done(layerError);
			}

			// find next matching layer
			let layer, match = false, host;

			while(match !== true && idx < stack.length) {
				layer = stack[idx++];
				match = layer.match(path);
				host = layer.host;

				if(typeof match !== 'boolean') {
					// hold on to layerError
					layerError = layerError || match;
				}

				if(match !== true) {
					continue;
				}

				if(!host) {
					continue;
				}

				if(layerError || !host._handles_rrtype(req.qtype)) {
					match = false;
				}
			}

			if(match !== true) {
				return done(layerError);
			}

			if(host) {
				req.host = host;
			}

			req.params = this.mergeParams ? mergeParams(layer.params, parentParams) : layer.params;
		};
		req.next();
	}
}

/**
 * Use the given middleware function, with optional path, defaulting to "/".
 *
 * Use (like `.all`) will run for any http METHOD, but it will not add
 * handlers for those methods so OPTIONS requests will not consider `.use`
 * functions even if they could respond.
 *
 * The other difference is that _route_ path is stripped and not visible
 * to the handler function. The main effect of this feature is that mounted
 * handlers can operate without any code changes regardless of the "prefix"
 * pathname.
 *
 * @public
 */

proto.use = function use(fn) {
	const path = typeof fn !== 'function' ? fn : '/';
	const callbacks = Array.prototype.slice.call(arguments, typeof fn === 'function' ? 0 : 1);

	if(callbacks.length === 0) {
		throw new TypeError('Zone.use() requires a middleware function')
	}

	for(const fn of callbacks) {
		if(typeof fn !== 'function') {
			throw new TypeError('Zone.use() requires a middleware function');
		}
		const layer = new Layer(path, fn);
		layer.host = undefined;
		this.stack.push(layer);
	}

	return this;
};

/**
 * Create a new Route for the given path.
 *
 * Each route contains a separate middleware stack and VERB handlers.
 *
 * See the Route api documentation for details on adding handlers
 * and middleware to routes.
 *
 * @param {String} path
 * @return {Route}
 * @public
 */

proto.route = function route(path) {
	var route = new Route(path);

	var layer = new Layer(path, {
		sensitive: this.caseSensitive,
		strict: this.strict,
		end: true
	}, route.dispatch.bind(route));

	layer.route = route;

	this.stack.push(layer);
	return route;
};

// create Router#VERB functions
methods.concat('all').forEach(function(method) {
	proto[method] = function(path) {
		var route = this.route(path)
		route[method].apply(route, slice.call(arguments, 1));
		return this;
	};
});


/**
 * Match path to a layer.
 *
 * @param {Layer} layer
 * @param {string} path
 * @private
 */

function matchLayer(layer, path) {
	try {
		return layer.match(path);
	} catch(err) {
		return err;
	}
}

// merge params with parent params
function mergeParams(params, parent) {
	if(typeof parent !== 'object' || !parent) {
		return params;
	}

	// make copy of parent for base
	const obj = Object.assign({}, parent);

	// simple non-numeric merging
	if(!(0 in params) || !(0 in parent)) {
		return Object.assign(obj, params);
	}

	let i = 0, o = 0;

	// determine numeric gaps
	while(i in params) {
		i++;
	}

	while(o in parent) {
		o++;
	}

	// offset numeric indices in params before merge
	for(i--; i >= 0; i--) {
		params[i + o] = params[i];

		// create holes for the merge when necessary
		if(i < o) {
			delete params[i];
		}
	}

	return Object.assign(obj, params);
}

// restore obj props after function
function restore(fn, obj) {
	const props = new Array(arguments.length - 2);
	const vals = new Array(arguments.length - 2);

	for(let i = 0; i < props.length; i++) {
		props[i] = arguments[i + 2];
		vals[i] = obj[props[i]];
	}

	return function() {
		// restore vals
		for(let i = 0; i < props.length; i++) {
			obj[props[i]] = vals[i];
		}

		return fn.apply(this, arguments);
	};
}


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

	handler._middlewares = [];

	return handler;
};


const handlerProto = Object.create(Function.prototype);


/**
 * @param name {string} RR name
 * @param type {string} RR type
 */
handlerProto.use = function use(name, type) {
	let callbacks;
	if(typeof name === 'function') {
		callbacks = Array.prototype.slice.call(arguments);
		name = '';
		type = '';
	} else if(type === 'function') {
		callbacks = Array.prototype.slice.call(arguments, 1);
		type = '';
	} else {
		callbacks = Array.prototype.slice(arguments, 2);
	}

	if(typeof name !== 'string' || typeof type !== 'string') {
		throw new Error('RR name and type must be strings');
	}

	const zone = name ? name.split('.').reverse() : []; // e.g. [ "com", "example", "www" ]

	const match = (qzone, qtype) => {
		if(type && type !== qtype) {
			return null;
		}
		if(qzone.length < zone.length) {
			return null;
		}
		return zoneParams(zone, qzone);
	};
	const errorMatch = (qzone, qtype, error) => {
		return error ? match(qzone, qtype) : null;
	};
	const nonErrorMatch = (qzone, qtype, error) => {
		return error ? null : match(qzone, qtype);
	};

	for(const fn of callbacks) {
		if(typeof fn !== 'function') {
			throw new Error('Callback must be a function');
		}
		this._middlewares.push({ match: fn.length > 3 ? errorMatch : nonErrorMatch, fn, zoneLength });
	}

	return this;
};


for(const rrtype in packet.Type) {
	if(typeof packet.Type[rrtype] === 'number') {
		handlerProto[rrtype.toLowerCase()] = function() {
			const type = rrtype;
			return function rrtypeUse(name) {
				let callbacks;
				if(typeof name === 'function') {
					callbacks = Array.prototype.slice.call(arguments, 1);
					name = '';
				} else {
					callbacks = Array.prototype.slice(arguments, 2);
				}

				if(typeof name !== 'string') {
					throw new Error('RR name be a strings');
				}

				const zone = name ? name.split('.').reverse() : []; // e.g. [ "com", "example", "www" ]
				const zoneLength = zone.length;

				const match = (qzone, qtype) => {
					if(type !== 'all' && type !== qtype) {
						return null;
					}

					if(qzone.length !== zoneLength) {
						return null;
					}

					const params = {};
					for(let i = 0; i < zoneLength; i++) {
						if(zone[i][0] === ':') {
							params[zone[i].slice(1)] = qzone[i];
						} else if(zone[i] !== qzone[i]) {
							return null;
						}
					}
					return params;
				};
				const errorMatch = (qzone, qtype, error) => {
					return error ? match(qzone, qtype) : null;
				};
				const nonErrorMatch = (qzone, qtype, error) => {
					return error ? null : match(qzone, qtype);
				};

				for(const fn of callbacks) {
					if(typeof fn !== 'function') {
						throw new Error('Callback must be a function');
					}
					this._middlewares.push({ match: fn.length > 3 ? errorMatch : nonErrorMatch, fn, zoneLength });
				}

				return this;
			}
		}();
	}
}


handlerProto.handle = function handle(req, res, callback) {

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

	req.host = req.qname.split('.').reverse(); // e.g. [ "com", "example", "www" ]

	const middlewareIterator = this._middlewares[Symbol.iterator]();
	let error = null;

	const next = e => {
		if(res.sent) {
			// response has already been sent
			callback(null);
			return;
		}

		if(e) {
			error = e;
		}

		const nextMiddleware = middlewareIterator.next();

		if(nextMiddleware.done) {
			if(error) {
				debug('Unhandler error: ', error);
			}
			// no more middlewares, send result
			res.send();
			if(callback) {
				callback(error);
			}
			return;
		}

		req.layers = [req.zone];
		req.params = {};
		nextMiddleware.value.handle(req.zone, req.qtype, error, next);
	};

	next();
};

