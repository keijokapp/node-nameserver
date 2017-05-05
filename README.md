Proof of concept DNS server library inspired by Express.

**Note:** This is just proof of concept. I might rewrite the whole thing (including master branch history) at any time. If you think, this library is for you and want to contribute, please let me know.

**Features:**

 * Support for single-question queries only (which is fine according to some internet resources)
 * Express-like middlewares and "routing"
 * DNS over TCP and UDP
 * DNS zones (and subzones) similar to Express routers
 * Basic EDNS options
 * Basic DNS client forwarding middleware (should be moved to another module)
 * *maybe something more*

**TODO:**

 * Stabilize and optimize core functionality
 * Write unit tests
 * Implement recursor and DNSSEC support
 * Review implementation against DNS standards
 * *and so on...*
