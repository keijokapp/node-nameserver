module.exports = function Request() {
	if(!(this instanceof Request)) {
		return new Request;
	}
};
