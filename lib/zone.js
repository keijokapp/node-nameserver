const debug = require('debug')('nameserver:zone');
const packet = require('nameserver-packet');

/**
 * DNS zone
 * @returns {function} nameserver middleware to serve a zone
 */
module.exports = function zone() {

	/**
	 * Zone handler
	 * @param req {Request} DNS request
	 * @param res {Response} DNS response
	 * @param next {function} function to be called on complete
	 */
	function handler(req, res, next) {
		handler.handle(req, res, next);
	}

	Object.setPrototypeOf(handler, handlerProto);

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
	const zone = name.split('.').filter(a => a !== '').reverse(); // e.g. [ "com", "example", "www" ]
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
					const zone = name.split('.').filter(a => a !== '').reverse(); // e.g. [ "com", "example", "www" ]
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

handlerProto.handle = function handle(req, res, next) {

	const middlewareIterator = this._middlewares[Symbol.iterator]();
	const subzone = req.subzone;
	var error = null;

	const zoneNext = e => {

		if(res.sent) {
			// response has already been sent
			req.subzone = subzone;
			next(error);
			return;
		}

		if(e) {
			error = e;
		}

		var params, middleware;
		do {
			const nextMiddleware = middlewareIterator.next();
			if(nextMiddleware.done) {
				req.subzone = subzone;
				next(error);
				return;
			}
			if(params = nextMiddleware.value.match(subzone, req.qtype, Boolean(error))) {
				middleware = nextMiddleware.value;
			}
		} while(!params);

		req.subzone = subzone.slice(middleware.zoneLength);
		req.params = params;

		if(error) {
			middleware.fn.call(this, error, req, res, zoneNext);
		} else {
			middleware.fn.call(this, req, res, zoneNext);
		}
	};

	zoneNext();
};

