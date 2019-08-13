/*jslint node: true */
"use strict";
exports.port = null;
//exports.myUrl = 'wss://mydomain.com/bb';
exports.bServeAsHub = false;
exports.bLight = false;

exports.storage = 'sqlite';

// TOR is recommended.  If you don't run TOR, please comment the next two lines
//exports.socksHost = '127.0.0.1';
//exports.socksPort = 9050;

exports.hub = process.env.testnet ? 'obyte.org/bb-test' : 'obyte.org/bb';
exports.deviceName = 'Accredited Investor Attestation Bot';
exports.permanent_pairing_secret = '0000';
exports.control_addresses = [''];
exports.payout_address = 'WHERE THE MONEY CAN BE SENT TO';

exports.bIgnoreUnpairRequests = true;
exports.bSingleAddress = false;
exports.bStaticChangeAddress = true;
exports.KEYS_FILENAME = 'keys.json';

// smtp https://github.com/byteball/ocore/blob/master/mail.js
exports.smtpTransport = 'local'; // use 'local' for Unix Sendmail
exports.smtpRelay = '';
exports.smtpUser = '';
exports.smtpPassword = '';
exports.smtpSsl = null;
exports.smtpPort = null;

// email setup
exports.admin_email = '';
exports.from_email = '';

// witnessing
exports.bRunWitness = false;
exports.THRESHOLD_DISTANCE = 20;
exports.MIN_AVAILABLE_WITNESSINGS = 100;
exports.bPostTimestamp = true;

// verifyinvestor.com service
exports.verifyInvestorUrl = 'https://www.verifyinvestor.com';
exports.verifyInvestorApiToken = '';
exports.verifyInvestorUserAuthorizationToken = '';

// finance
exports.priceInUSD = 79;
exports.rewardInUSD = 79;
exports.referralRewardInUSD = 20;

exports.PRICE_TIMEOUT = 24*3600; // in seconds

exports.bRequireRealName = true;
exports.arrRealNameAttestors = ['I2ADHGP4HL6J37NQAD73J7E5SKFIXJOT', 'OHVQ2R5B6TUR5U7WJNYLP3FIOSR7VCED'];
exports.objMapRequiredVIPersonalDataWithProfile = { // match verify investor data with private profile data
	'first_name': {
		name: 'first name',
		path: ['first_name',0]
	},
	'last_name': {
		name: 'last name',
		path: ['last_name',0]
	}
};
exports.arrRequiredPersonalData = Object.keys(exports.objMapRequiredVIPersonalDataWithProfile);

// server
exports.webPort = 8080;

