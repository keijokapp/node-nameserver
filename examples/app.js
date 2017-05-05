const dgram = require('dgram');
const net = require('net');
const forward = require('nameserver-forward');
const nameserver = require('../lib/nameserver');
const zone = require('../lib/zone');


const ns = nameserver();

ns.a(':name.exmple.com', (req, res, next) => {
	console.log(req.params, req.subzone);
	next();
});

ns.use(':domain.com', (req, res, next) => {
	console.log(req.params, req.subzone);
	next();
});

const exampleZone = zone();

exampleZone.ns('', (req, res, next) => {
	res.packet.answer.push({
		type: 'NS',
		name: req.qname,
		host: 'ns.example.org'
	});

	next();
});

exampleZone.a('www', (req, res, next) => {
	res.packet.answer.push({
		type: 'A',
		name: req.qname,
		ip: '123.123.123.123'
	});

	next();
});

ns.use('example.com', exampleZone);

ns.use(forward([ '8.8.8.8', '8.8.4.4' ]));

const udpSocket = dgram.createSocket('udp4', ns);

udpSocket.bind(53, '127.0.0.2', e => {
	if(e) {
		console.error(e);
	} else {
		const address = udpSocket.address();
		console.log('DNS/UDP server listening on %s:%d', address.address, address.port);
	}
});

const tcpSocket = net.createServer(ns);

tcpSocket.listen(53, '127.0.0.2', e => {
	if(e) {
		console.error(e);
	} else {
		const address = tcpSocket.address();
		console.log('DNS/TCP server listening on %s:%d', address.address, address.port);
	}
});
