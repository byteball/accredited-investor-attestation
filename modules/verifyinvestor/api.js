/*jslint node: true */
'use strict';
const request = require('request');
const conf = require('byteballcore/conf.js');
const notifications = require('./../notifications.js');

const API_TOKEN = conf.verifyInvestorApiToken;
const USER_AUTHORIZATION_TOKEN = conf.verifyInvestorUserAuthorizationToken;
const URL = conf.verifyInvestorUrl;

exports.sendRequest = sendRequest;
exports.getUrnByKey = getUrnByKey;

exports.getAuthUrn= (identifier) => {
	return getUrnByKey('auth', identifier);
};

exports.checkAuthAndGetVerifyInvestorUserId = (identifier, onDone) => {
	sendRequest(
		getUrnByKey('identifier', identifier),
		(err, response, body) => {
			// console.error('checkAuthAndGetVerifyInvestorUserId', identifier, err, response.statusCode, body);
			if (err) {
				notifications.notifyAdmin(`verifyinvestor api checkAuth: ${identifier} err`, err);
				return onDone(err);
			}

			const statusCode = response.statusCode;
			if (statusCode !== 200) {
				if (statusCode === 404) {
					// User does not exist, or has not authorized your application
					return onDone(null, false);
				}

				notifications.notifyAdmin(`verifyinvestor api checkAuth: ${identifier} statusCode ${statusCode}`, body);
				return onDone(statusCode);
			}

			if (!body || !body.id) {
				notifications.notifyAdmin(`verifyinvestor api checkAuth: ${identifier} body`, body);
				return onDone('wrong body');
			}

			return onDone(null, body.id);
		}
	);
};

exports.postVerificationRequest = (vi_user_id, user_address, onDone) => {
	sendRequest(
		{
			method: 'POST',
			urn: getUrnByKey('user_verification_requests', vi_user_id),
			form: {
				deal_name: `byteball address ${user_address}`,
				legal_name: `byteball address ${user_address}`
			}
		}, (err, response, body) => {
			if (err) {
				notifications.notifyAdmin(`verifyinvestor api postVerificationRequest: ${vi_user_id} err`, err);
				return onDone(err);
			}

			const statusCode = response.statusCode;
			if (statusCode !== 201) {
				notifications.notifyAdmin(`verifyinvestor api postVerificationRequest: ${vi_user_id} statusCode ${statusCode}`, body);
				return onDone(statusCode);
			}

			if (!body || !body.id) {
				notifications.notifyAdmin(`verifyinvestor api postVerificationRequest: ${vi_user_id} body`, body);
				return onDone('wrong body');
			}

			return onDone(null, body.id);
		}
	);
};

exports.getStatusOfVerificationRequest = (vi_user_id, vi_vr_id, onDone) => {
	sendRequest(
		getUrnByKey('verify_user_request', vi_user_id, vi_vr_id),
		(err, response, body) => {
			console.error('getStatusOfVerificationRequest', vi_user_id, vi_vr_id, err, response.statusCode, body);
			if (err) {
				notifications.notifyAdmin(`verifyinvestor api checkUserVerifyRequest: ${vi_user_id} ${vi_vr_id} err`, err);
				return onDone(err);
			}

			const statusCode = response.statusCode;
			if (statusCode !== 200) {
				if (statusCode === 404) {
					return onDone(null, statusCode, null);
				} else {
					notifications.notifyAdmin(`verifyinvestor api checkUserVerifyRequest: ${vi_user_id} ${vi_vr_id} statusCode ${statusCode}`, body);
					return onDone(statusCode);
				}

			}

			if (!body || !body.id || body.id !== vi_vr_id || !body.status) {
				notifications.notifyAdmin(`verifyinvestor api checkUserVerifyRequest: ${vi_user_id} ${vi_vr_id} body`, body);
				return onDone('wrong body');
			}

			return onDone(null, statusCode, body.status);
		}
	);
};


function getUrnByKey(key) {
	switch (key) {
		case 'api':
			return `/api/v1`;
		case 'auth': {
			if (!arguments[1]) throw new Error('require set identifier');
			return `/authorization/${USER_AUTHORIZATION_TOKEN}?identifier=${arguments[1]}`;
		}
		case 'identifier': {
			if (!arguments[1]) throw new Error('require set identifier');
			return `/api/v1/users/identifier/${arguments[1]}`;
		}
		case 'users':
			return '/api/v1/users';
		case 'user': {
			if (!arguments[1]) throw new Error('require set user id');
			return `/api/v1/users/${arguments[1]}`;
		}
		case 'user_verification_requests': {
			if (!arguments[1]) throw new Error('require set user id');
			return `/api/v1/users/${arguments[1]}/verification_requests`
		}
		case 'verify_user_request': {
			if (!arguments[1]) throw new Error('require set user id');
			if (!arguments[2]) throw new Error('require set verification request id');
			return `/api/v1/users/${arguments[1]}/verification_requests/${arguments[2]}`;
		}
		case 'review_user_request': { // staging only
			if (!arguments[1]) throw new Error('require set user id');
			if (!arguments[2]) throw new Error('require set verification request id');
			return `/api/v1/users/${arguments[1]}/verification_requests/${arguments[2]}/review`;
		}
		default:
			throw new Error(`undefined key: ${key}`);
	}
}

function sendRequest(options, callback) {
	let urn;
	if (typeof options === 'string') {
		urn = options;
		options = {};
	} else {
		if (!options.urn) throw new Error('require define urn param in options');
		urn = options.urn;
		delete options.urn;
	}
	let resultOptions = Object.assign({}, {
		method: 'GET',
		url: `${URL}${urn}`,
		json: true,
		headers: {
			'Authorization': `Token ${API_TOKEN}`,
			"Content-Type": "application/json",
			"User-Agent": "Byteball attestation/1.0"
		}
	}, options);
	request(resultOptions, (err, request, body) => callback(err, request, body, resultOptions));
}