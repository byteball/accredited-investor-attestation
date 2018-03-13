/*jslint node: true */
'use strict';
const _ = require('lodash');
const constants = require('byteballcore/constants.js');
const conf = require('byteballcore/conf');
const db = require('byteballcore/db');
const eventBus = require('byteballcore/event_bus');
const privateProfile = require('byteballcore/private_profile');
const validationUtils = require('byteballcore/validation_utils');
const headlessWallet = require('headless-byteball');
const texts = require('./modules/texts');
const reward = require('./modules/reward');
const conversion = require('./modules/conversion');
const investorAttestation = require('./modules/attestation');
const notifications = require('./modules/notifications');
const verifyInvestor = require('./modules/verifyinvestor');

const server = require('./modules/server');

/**
 * user pairs his device with bot
 */
eventBus.on('paired', (from_address) => {
	respond(from_address, '', texts.greeting());
});

/**
 * ready headless and conversion rates
 */
eventBus.once('headless_and_rates_ready', handleHeadlessAndRatesReady);

/**
 * ready headless wallet
 */
eventBus.once('headless_wallet_ready', handleWalletReady);

function handleHeadlessAndRatesReady() {
	if (conf.bRunWitness) {
		require('byteball-witness');
		eventBus.emit('headless_wallet_ready');
	} else {
		headlessWallet.setupChatEventHandlers();
	}

	/**
	 * user sends message to the bot
	 */
	eventBus.on('text', (from_address, text) => {
		respond(from_address, text.trim());
	});

	/**
	 * user pays to the bot
	 */
	eventBus.on('new_my_transactions', handleNewTransactions);

	/**
	 * pay is confirmed
	 */
	eventBus.on('my_transactions_became_stable', handleTransactionsBecameStable);
}

function handleWalletReady() {
	let error = '';

	/**
	 * check if database tables is created
	 */
	let arrTableNames = [
		'users','receiving_addresses','transactions','attestation_units','rejected_payments',
		'reward_units','referral_reward_units'
	];
	db.query("SELECT name FROM sqlite_master WHERE type='table' AND NAME IN (?)", [arrTableNames], (rows) => {
		if (rows.length !== arrTableNames.length) {
			error += texts.errorInitSql();
		}

		/**
		 * check if config is filled correct
		 */
		if (conf.bUseSmtp && (!conf.smtpHost || !conf.smtpUser || !conf.smtpPassword)) {
			error += texts.errorConfigSmtp();
		}
		if (!conf.admin_email || !conf.from_email) {
			error += texts.errorConfigEmail();
		}
		if (!conf.salt) {
			error += texts.errorConfigSalt();
		}
		if (!conf.verifyInvestorApiToken || !conf.verifyInvestorUserAuthorizationToken) {
			error += texts.errorConfigVerifyInvestorToken();
		}

		if (error) {
			throw new Error(error);
		}

		headlessWallet.issueOrSelectAddressByIndex(0, 0, (address1) => {
			console.log('== investor attestation address: ' + address1);
			investorAttestation.investorAttestorAddress = address1;
			// reward.distributionAddress = address1;

			headlessWallet.issueOrSelectAddressByIndex(0, 1, (address2) => {
				console.log('== distribution address: ' + address2);
				reward.distributionAddress = address2;

				server.setHandlerCheckVerificationRequest(handleCheckVerificationRequest);
				server.listen(conf.webPort, () => {
					console.log(`== server start listen on ${conf.webPort} port`);
				});

				setInterval(investorAttestation.retryPostingAttestations, 10*1000);
				setInterval(reward.retrySendingRewards, 10*1000);
				setInterval(moveFundsToAttestorAddresses, 60*1000);
				setInterval(verifyInvestor.retryCheckAuthAndPostVerificationRequest, 60*1000);
				setInterval(retryCheckVerificationRequests, 600*1000);
			});
		});
	});
}

function retryCheckVerificationRequests() {
	verifyInvestor.retryCheckVerificationRequests(handleCheckVerificationRequest);
}

function handleCheckVerificationRequest(err, transaction_id) {
	if (err || !transaction_id) {
		return;
	}
	let device = require('byteballcore/device.js');

	db.query(
		`SELECT user_address, vi_user_id, device_address, payment_unit
		FROM transactions 
		CROSS JOIN receiving_addresses USING(receiving_address) 
		WHERE transaction_id=?`,
		[transaction_id],
		(rows) => {
			let row = rows[0];

			db.query(
				`INSERT ${db.getIgnore()} INTO attestation_units 
				(transaction_id) 
				VALUES (?)`,
				[transaction_id],
				() => {

					let	attestation = investorAttestation.getAttestationPayload(row.user_address, row.vi_user_id);

					investorAttestation.postAndWriteAttestation(
						transaction_id,
						investorAttestation.investorAttestorAddress,
						attestation
					);

					if (conf.rewardInUSD) {
						let rewardInBytes = conversion.getPriceInBytes(conf.rewardInUSD);
						db.query(
							`INSERT ${db.getIgnore()} INTO reward_units
							(transaction_id, user_address, vi_user_id, reward)
							VALUES (?,?,?,?)`,
							[transaction_id, row.user_address, row.vi_user_id, rewardInBytes],
							(res) => {
								console.error(`reward_units insertId: ${res.insertId}, affectedRows: ${res.affectedRows}`);
								if (!res.affectedRows) {
									return console.log(`duplicate user_address or vi_user_id: ${row.user_address}, ${row.vi_user_id}`);
								}

								device.sendMessageToDevice(row.device_address, 'text', texts.attestedSuccessFirstTimeBonus(rewardInBytes));
								reward.sendAndWriteReward('attestation', transaction_id);

								if (conf.referralRewardInUSD) {
									let referralRewardInBytes = conversion.getPriceInBytes(conf.referralRewardInUSD);
									reward.findReferral(row.payment_unit, (referring_vi_user_id, referring_user_address, referring_user_device_address) => {
										if (!referring_user_address) {
											// console.error("no referring user for " + row.user_address);
											return console.log("no referring user for " + row.user_address);
										}

										db.query(
											`INSERT ${db.getIgnore()} INTO referral_reward_units
											(transaction_id, user_address, vi_user_id, new_user_address, new_vi_user_id, reward)
											VALUES (?, ?,?, ?,?, ?)`,
											[
												transaction_id,
												referring_user_address, referring_vi_user_id,
												row.user_address, attestation.profile.vi_user_id,
												referralRewardInBytes
											],
											(res) => {
												console.log(`referral_reward_units insertId: ${res.insertId}, affectedRows: ${res.affectedRows}`);
												if (!res.affectedRows) {
													return notifications.notifyAdmin(
														"duplicate referral reward",
														`referral reward for new user ${row.user_address} ${attestation.profile.vi_user_id} already written`
													);
												}

												device.sendMessageToDevice(referring_user_device_address, 'text', texts.referredUserBonus(conf.referralRewardInBytes));
												reward.sendAndWriteReward('referral', transaction_id);
											}
										);
									});
								} // if conf.referralRewardInBytes

							}
						);
					} // if conf.rewardInBytes

				}
			);

		});
}

function moveFundsToAttestorAddresses() {
	let network = require('byteballcore/network.js');
	if (network.isCatchingUp())
		return;

	console.log('moveFundsToAttestorAddresses');
	db.query(
		`SELECT DISTINCT receiving_address
		FROM receiving_addresses 
		CROSS JOIN outputs ON receiving_address = address 
		JOIN units USING(unit)
		WHERE is_stable=1 AND is_spent=0 AND asset IS NULL
		LIMIT ?`,
		[constants.MAX_AUTHORS_PER_UNIT],
		(rows) => {
			// console.error('moveFundsToAttestorAddresses', rows);
			if (rows.length === 0) {
				return;
			}

			let arrAddresses = rows.map(row => row.receiving_address);
			// console.error(arrAddresses, investorAttestation.investorAttestorAddress);
			let headlessWallet = require('headless-byteball');
			headlessWallet.sendMultiPayment({
				asset: null,
				to_address: investorAttestation.investorAttestorAddress,
				send_all: true,
				paying_addresses: arrAddresses
			}, (err, unit) => {
				if (err) {
					console.error("failed to move funds: " + err);
					let balances = require('byteballcore/balances');
					balances.readBalance(arrAddresses[0], (balance) => {
						console.error('balance', balance);
						notifications.notifyAdmin('failed to move funds', err + ", balance: " + JSON.stringify(balance));
					});
				} else {
					console.log("moved funds, unit " + unit);
				}
			});
		}
	);
}

function handleNewTransactions(arrUnits) {
	let device = require('byteballcore/device.js');
	db.query(
		`SELECT
			amount, asset, unit,
			receiving_address, device_address, user_address, price, 
			${db.getUnixTimestamp('last_price_date')} AS price_ts
		FROM outputs
		CROSS JOIN receiving_addresses ON receiving_addresses.receiving_address = outputs.address
		WHERE unit IN(?)
			AND NOT EXISTS (
				SELECT 1
				FROM unit_authors
				CROSS JOIN my_addresses USING(address)
				WHERE unit_authors.unit = outputs.unit
			)`,
		[arrUnits],
		(rows) => {
			rows.forEach((row) => {

				function checkPayment(onDone) {
					let delay = Math.round(Date.now()/1000 - row.price_ts);
					let bLate = (delay > conf.PRICE_TIMEOUT);
					if (row.asset !== null) {
						return onDone("Received payment in wrong asset", delay);
					}

					let current_price = conversion.getPriceInBytes(conf.priceInUSD);
					let expected_amount = bLate ? current_price : row.price;
					if (row.amount < expected_amount) {
						updatePrice(row.device_address, current_price);
						let text = `Received ${(row.amount/1e9)} GB from you`;
						text += bLate
							? ".\nYour payment is too late and less than the current price."
							: `, which is less than the expected ${(row.price/1e9)} GB.`;
						return onDone(text + '\n\n' + texts.pleasePay(row.receiving_address, current_price, row.user_address), delay);
					}

					db.query("SELECT address FROM unit_authors WHERE unit=?", [row.unit], (author_rows) => {
						if (author_rows.length !== 1) {
							resetUserAddress();
							return onDone(texts.receivedPaymentFromMultipleAddresses() + '\n' + texts.switchToSingleAddress());
						}
						if (author_rows[0].address !== row.user_address) {
							resetUserAddress();
							return onDone(texts.receivedPaymentNotFromExpectedAddress(row.user_address) + `\n` + texts.switchToSingleAddress());
						}
						onDone();
					});
				}

				function resetUserAddress(){
					db.query("UPDATE users SET user_address=NULL WHERE device_address=?", [row.device_address]);
				}

				checkPayment((error, delay) => {
					if (error) {
						return db.query(
							`INSERT ${db.getIgnore()} INTO rejected_payments
							(receiving_address, price, received_amount, delay, payment_unit, error)
							VALUES (?,?, ?,?, ?,?)`,
							[row.receiving_address, row.price, row.amount, delay, row.unit, error],
							() => {
								device.sendMessageToDevice(row.device_address, 'text', error);
							}
						);
					}

					db.query(
						`INSERT INTO transactions
						(receiving_address, price, received_amount, payment_unit)
						VALUES (?,?,?,?)`,
						[row.receiving_address, row.price, row.amount, row.unit],
						() => {
							device.sendMessageToDevice(row.device_address, 'text', texts.receivedYourPayment(row.amount));
						}
					);

				}); // checkPayment

			});
		}
	);
}

function handleTransactionsBecameStable(arrUnits) {
	let device = require('byteballcore/device.js');
	db.query(
		`SELECT 
			transaction_id, 
			device_address, user_address,
			src_profile
		FROM transactions
		JOIN receiving_addresses USING(receiving_address)
		LEFT JOIN private_profiles ON private_profiles.address = receiving_addresses.user_address 
		WHERE payment_unit IN(?)`,
		[arrUnits],
		(rows) => {
			rows.forEach((row) => {

				checkUserScrProfileData(row, row.device_address);

				db.query(
					`UPDATE transactions 
					SET confirmation_date=${db.getNow()}, is_confirmed=1, vi_status='in_authentication'
					WHERE transaction_id=?`,
					[row.transaction_id],
					() => {
						device.sendMessageToDevice(
							row.device_address,
							'text',
							texts.paymentIsConfirmed() + '\n\n' +
							texts.clickInvestorLink(verifyInvestor.getAuthUrl(`ua${row.user_address}_${row.device_address}`, row.src_profile))
						);
					}
				);
			});
		}
	);
}

/**
 * scenario for responding to user requests
 * @param from_address
 * @param text
 * @param response
 */
function respond (from_address, text, response = '') {
	let device = require('byteballcore/device.js');
	readUserInfo(from_address, (userInfo) => {

		function checkUserAddress(onDone) {

			function saveBBAddressToUser(address) {
				userInfo.user_address = address;
				response += texts.goingToAttestAddress(userInfo.user_address);
				return db.query(
					'UPDATE users SET user_address=? WHERE device_address=?',
					[userInfo.user_address, from_address],
					() => {
						onDone();
					}
				);
			}

			let arrProfileMatches = text.match(/\(profile:(.+?)\)/);

			if (validationUtils.isValidAddress(text)) {
				if (conf.bRequireRealName) {
					return onDone(texts.requireInsertProfileData());
				}

				return saveBBAddressToUser(text);
			}
			else if (arrProfileMatches) {
				if (!conf.bRequireRealName) {
					return onDone(texts.requireInsertBBAddress());
				}

				let privateProfileJsonBase64 = arrProfileMatches[1];
				let objPrivateProfile = privateProfile.getPrivateProfileFromJsonBase64(privateProfileJsonBase64);
				if (!objPrivateProfile) {
					return onDone("Invalid private profile");
				}

				return privateProfile.parseAndValidatePrivateProfile(objPrivateProfile, (err, address, attestor_address) => {
					if (err) {
						return onDone("Failed to parse the private profile: " + err);
					}

					if (conf.arrRealNameAttestors.indexOf(attestor_address) === -1) {
						return onDone(texts.wrongRealNameAttestorAddress(attestor_address));
					}

					let assocPrivateData = privateProfile.parseSrcProfile(objPrivateProfile.src_profile);
					let arrMissingFields = _.difference(conf.arrRequiredPersonalData, Object.keys(assocPrivateData));
					if (arrMissingFields.length > 0) {
						return onDone(texts.missingProfileFields(arrMissingFields));
					}

					privateProfile.savePrivateProfile(objPrivateProfile, address, attestor_address);
					saveBBAddressToUser(address);
				});
			}

			if (userInfo.user_address) return onDone();
			onDone(texts.insertMyAddress());
		}

		checkUserAddress((userAddressResponse) => {
			if (userAddressResponse) {
				return device.sendMessageToDevice(from_address, 'text', (response ? response + '\n\n' : '') + userAddressResponse);
			}

			readOrAssignReceivingAddress(from_address, userInfo, (receiving_address) => {
				let price = conversion.getPriceInBytes(conf.priceInUSD);
				updatePrice(receiving_address, price);

				if (text === 'again') {
					return device.sendMessageToDevice(
						from_address,
						'text',
						(response ? response + '\n\n' : '') + texts.pleasePay(receiving_address, price, userInfo.user_address)
					);
				}

				db.query(
					`SELECT
						transaction_id, is_confirmed, received_amount, user_address,
						vi_status, vi_vr_status,
						attestation_date
					FROM transactions
					JOIN receiving_addresses USING(receiving_address)
					LEFT JOIN attestation_units USING(transaction_id)
					WHERE receiving_address=?
					ORDER BY transaction_id DESC
					LIMIT 1`,
					[receiving_address],
					(rows) => {
						/**
						 * if user didn't pay yet
						 */
						if (rows.length === 0) {
							return device.sendMessageToDevice(
								from_address,
								'text',
								(response ? response + '\n\n' : '') + texts.pleasePay(receiving_address, price, userInfo.user_address)
							);
						}

						let row = rows[0];

						/**
						 * if user payed, but transaction did not become stable
						 */
						if (row.is_confirmed === 0) {
							return device.sendMessageToDevice(
								from_address,
								'text',
								(response ? response + '\n\n' : '') + texts.receivedYourPayment(row.received_amount)
							);
						}

						let vi_status = row.vi_status;

						if (vi_status === 'in_authentication') {
							return device.sendMessageToDevice(
								from_address,
								'text',
								(response ? response + '\n\n' : '') +
								texts.clickInvestorLink(verifyInvestor.getAuthUrl(`ua${row.user_address}_${from_address}`, userInfo.src_profile))
							);
						}

						if (vi_status === 'in_verification') {
							return device.sendMessageToDevice(
								from_address,
								'text',
								(response ? response + '\n\n' : '') + texts.waitingWhileVerificationRequestFinished()
							)
						}

						if (vi_status === 'not_accredited') {
							return device.sendMessageToDevice(
								from_address,
								'text',
								(response ? response + '\n\n' : '') + texts.previousAttestationFailed(verifyInvestor.getVerReqStatusDescription(row.vi_vr_status))
							)
						}

						if (!row.attestation_date) {
							return device.sendMessageToDevice(
								from_address,
								'text',
								(response ? response + '\n\n' : '') + texts.inAttestation()
							);
						}

						/**
						 * no more available commands, user is attested
						 */
						return device.sendMessageToDevice(
							from_address,
							'text',
							(response ? response + '\n\n' : '') + texts.alreadyAttested(row.attestation_date)
						);

					}
				);

			});

		});
	});
}

function updatePrice(receiving_address, price, cb) {
	db.query(`UPDATE receiving_addresses SET price=?, last_price_date=${db.getNow()} WHERE receiving_address=?`, [price, receiving_address], () => {
		if (cb) cb();
	});
}

/**
 * get user's information by device address
 * or create new user, if it's new device address
 * @param device_address
 * @param callback
 */
function readUserInfo (device_address, callback) {
	db.query(
		`SELECT 
			user_address, src_profile
		FROM users
		LEFT JOIN private_profiles ON private_profiles.address = users.user_address 
		WHERE device_address = ?`,
		[device_address],
		(rows) => {
			if (rows.length) {
				let row = rows[0];

				checkUserScrProfileData(row, device_address);

				callback(row);
			} else {
				db.query(`INSERT ${db.getIgnore()} INTO users (device_address) VALUES(?)`, [device_address], () => {
					callback({ user_address: null, src_profile: {} });
				});
			}
		}
	);
}

function checkUserScrProfileData(row, device_address) {
	if (!conf.bRequireRealName) {
		row.src_profile = {};
	} else {
		if (!row.src_profile) {
			row.src_profile = {};
		} else {
			try {
				row.src_profile = JSON.parse(row.src_profile);
			} catch (err) {
				notifications.notifyAdmin('error parse src_profile', `device_address: ${device_address}, profile: ${row.src_profile}`);
				row.src_profile = {};
			}
		}
	}
}

/**
 * read or assign receiving address
 * @param device_address
 * @param userInfo
 * @param callback
 */
function readOrAssignReceivingAddress(device_address, userInfo, callback) {
	const mutex = require('byteballcore/mutex.js');
	mutex.lock([device_address], (unlock) => {
		db.query(
			`SELECT receiving_address, ${db.getUnixTimestamp('last_price_date')} AS price_ts
			FROM receiving_addresses 
			WHERE device_address=? AND user_address=?`,
			[device_address, userInfo.user_address],
			(rows) => {
				if (rows.length > 0) {
					let row = rows[0];
					callback(row.receiving_address);
					return unlock();
				}

				headlessWallet.issueNextMainAddress((receiving_address) => {
					db.query(
						`INSERT INTO receiving_addresses 
						(device_address, user_address, receiving_address) 
						VALUES(?,?,?)`,
						[device_address, userInfo.user_address, receiving_address],
						() => {
							callback(receiving_address);
							unlock();
						}
					);
				});
			}
		);
	});
}