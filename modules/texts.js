/*jslint node: true */
'use strict';
const desktopApp = require('byteballcore/desktop_app.js');
const conf = require('byteballcore/conf');

/**
 * responses for clients
 */
exports.greeting = () => {
	return [
		"Here you can attest yourself as accredited investor.  This will allow you to invest in ICOs that are available for accredited investors only.\n",
		"A proof of attestation of your Byteball address will be posted publicly on the distributed ledger.  Your name will not be published.\n\n",

		`The price of attestation is $${conf.priceInUSD.toLocaleString([], {minimumFractionDigits: 2})}. `,
		"The payment is nonrefundable even if the attestation fails for any reason.\n\n",

		'After payment, you will receive a link to VerifyInvestor.com service ',
		'that you will use to prove your accredited status. ',

		`After you successfully complete attestation for the first time, `,
		`you receive a $${conf.rewardInUSD.toLocaleString([], {minimumFractionDigits: 2})} reward in Bytes.`
	].join('');
};

exports.weHaveReferralProgram = () => {
	return [
		"Remember, we have a referral program: " +
		"if you send Bytes from your attested address to a new user who is not attested yet, " +
		"and he/she uses those Bytes to pay for a successful attestation, " +
		`you receive a $${conf.referralRewardInUSD.toLocaleString([], {minimumFractionDigits: 2})} reward in Bytes.`
	].join('');
};

exports.insertMyAddress = () => {
	if (conf.bRequireRealName) {
		let arrNamesOfRequiredKeys = [];
		let objMap = conf.objMapRequiredVIPersonalDataWithProfile;
		for (let key in objMap) {
			if (!objMap.hasOwnProperty(key)) continue;
			arrNamesOfRequiredKeys.push(objMap[key].name);
		}
		return [
			'To attest your accredited investor status, your real name has to be attested first and we\'ll require to provide your private profile, ',
			`which includes your ${arrNamesOfRequiredKeys.join(', ')}.\n`,
			'If you are not attested yet, find "Real name attestation bot" in the Bot Store and have your address attested.\n',
			`If you are already attested, click this link to reveal your private profile to us: [profile request](profile-request:${conf.arrRequiredPersonalData.join(',')}). `,
			'We\'ll keep your personal data private and only send it to VerifyInvestor.com service.'
		].join('');
	} else {
		return [
			"Please send me your address that you wish to attest (click ... and Insert my address).\n",
			"Make sure you are in a single-address wallet. ",
			"If you don't have a single-address wallet, ",
			"please add one (burger menu, add wallet) and fund it with the amount sufficient to pay for the attestation."
		].join('')
	}
};

exports.requireInsertProfileData = () => {
	return 'You have to provide your attested profile, just Byteball address is not enough.';
};
exports.requireInsertBBAddress = () => {
	return 'Private profile is not required';
};

exports.wrongRealNameAttestorAddress = (attestor_address) => {
	return [
		`We don't recognize the attestor ${attestor_address} who attested your profile.\n`,
		`The only trusted attestors are: ${conf.arrRealNameAttestors.join(', ')}`
	].join('');
};

exports.missingProfileFields = (arrMissingFields) => {
	return `These fields are missing in your profile: ${arrMissingFields.join(', ')}`
};

exports.goingToAttestAddress = (address) => {
	return `Thanks. ${conf.bRequireRealName?'Saved your personal data.\n':''}Going to attest your address: ${address}.`;
};

exports.pleasePay = (receivingAddress, price, user_address) => {
	return `Please pay for the attestation: [attestation payment](byteball:${receivingAddress}?amount=${price}&single_address=single${user_address}).`;
};

exports.switchToSingleAddress = () => {
	return [
		"Make sure you are in a single-address wallet, ",
		"otherwise switch to a single-address wallet or create one and send me your address before paying."
	].join('');
};

exports.receivedYourPayment = (amount) => {
	return `Received your payment of ${(amount/1e9)} GB, waiting for confirmation. It should take 5-10 minutes.`;
};

exports.paymentIsConfirmed = () => {
	return "Your payment is confirmed.";
};

exports.clickInvestorLink = (redirectUrl) => {
	return [
		`Please click this link to grant us access to your verification status on VerifyInvestor.com: ${redirectUrl}\n`,
		'If you already allowed access, please wait while we check it.'
	].join('');
};

exports.receivedAuthToUserAccount = () => {
	return 'We received access to updates about your verification status at VerifyInvestor.com, and submitted a verification request.';
};

exports.verificationStarted = () => {
	return [
		'Please check your dashboard at VerifyInvestor.com and complete the pending verification, we\'ll update you about the status.',
	].join('');
};

exports.waitingWhileVerificationUnderWay = () => {
	return [
		'Your verification is under way.\n',
		'If you have already completed the verification, please wait we check its result.'
	].join('');
};

exports.verificationRequestCompletedWithStatus = (statusDescription) => {
	return `Verification request completed with status: "${statusDescription}".`;
};

exports.inAttestation = () => {
	return `Verification request was confirmed. You are in attestation. Please wait.`;
};

exports.attestedSuccessFirstTimeBonus = (rewardInBytes) => {
	return [
		"You requested an attestation for the first time and will receive a welcome bonus ",
		`of $${conf.rewardInUSD.toLocaleString([], {minimumFractionDigits: 2})} `,
		`(${(rewardInBytes/1e9).toLocaleString([], {maximumFractionDigits: 9})} GB) `,
		"from Byteball distribution fund."
	].join('')
};

exports.referredUserBonus = (referralRewardInBytes) => {
	return [
		"You referred a user who has just verified his identity and you will receive a reward ",
		`of $${conf.referralRewardInUSD.toLocaleString([], {minimumFractionDigits: 2})} `,
		`(${(referralRewardInBytes/1e9).toLocaleString([], {maximumFractionDigits: 9})} GB) `,
		"from Byteball distribution fund.\n",
		"Thank you for bringing in a new byteballer, the value of the ecosystem grows with each new user!"
	].join('');
};

exports.alreadyAttested = (attestationDate) => {
	return `You were already attested at ${attestationDate} UTC. Attest [again](command: again)?`;
};

exports.currentAttestationFailed = () => {
	return "Your attestation failed. Try [again](command: again)?";
};
exports.previousAttestationFailed = () => {
	return "Your previous attestation failed. Try [again](command: again)?";
};


/**
 * errors initialize bot
 */
exports.errorInitSql = () => {
	return "please import db.sql file\n";
};

exports.errorConfigSmtp = () => {
	return `please specify smtpUser, smtpPassword and smtpHost in your ${desktopApp.getAppDataDir()}/conf.json\n`;
};

exports.errorConfigEmail = () => {
	return `please specify admin_email and from_email in your ${desktopApp.getAppDataDir()}/conf.json\n`;
};

exports.errorConfigVerifyInvestorToken = () => {
	return `please specify verifyInvestorApiToken and verifyInvestorUserAuthorizationToken in your ${desktopApp.getAppDataDir()}/conf.json`;
};