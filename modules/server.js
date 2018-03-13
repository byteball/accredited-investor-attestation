const express = require('express');
const bodyParser = require('body-parser');
const db = require('byteballcore/db');
const notifications = require('./notifications');
const verifyInvestor = require('./verifyinvestor');
const texts = require('./texts');

const app = express();
const server = require('http').Server(app);

let handles = {
	checkVerificationRequest: () => {}
};

app.use(bodyParser.urlencoded({ extended: false }));

app.post('*/cb', (req, res) => {
	let body = req.body;
	console.error('received callback', body);
	if (!body.verification_request_id || !body.investor_id || body.action !== 'verification_result') {
		notifications.notifyAdmin("cb without verification_request_id", JSON.stringify(body));
		return res.status(200).end();
	}

	db.query(
		`SELECT 
			transaction_id, device_address
		FROM transactions
		JOIN receiving_addresses USING(receiving_address)
		WHERE vi_user_id=? AND vi_vr_id=? AND vi_status='in_verification'`,
		[body.investor_id, body.verification_request_id],
		(rows) => {
			if (rows.length === 0) {
				notifications.notifyAdmin("cb verification_request_id not found", JSON.stringify(body));
				return;
			}

			const mutex = require('byteballcore/mutex.js');
			const device = require('byteballcore/device.js');
			let row = rows[0];
			let {transaction_id, device_address} = row;
			let {status: vi_vr_status} = body;

			mutex.lock(['tx-' + transaction_id], (unlock) => {
				db.query(
					`SELECT 
						vi_status
					FROM transactions
					WHERE transaction_id=?`,
					[transaction_id],
					(rows) => {
						let row = rows[0];
						if (row.vi_status !== 'in_verification') {
							unlock();
							return handles.checkVerificationRequest(null, false);
						}

						let vrStatusDescription = verifyInvestor.getVerReqStatusDescription(vi_vr_status);
						if (!vrStatusDescription) {
							// may be it will be new status in service
							notifications.notifyAdmin(`getVerReqStatusDescription`, `Status ${vi_vr_status} not found`);
							unlock();
							return handles.checkVerificationRequest(null, false);
						}

						if (verifyInvestor.checkIfVerificationRequestStatusIsNeutral(vi_vr_status)) {
							unlock();
							return handles.checkVerificationRequest(null, false);
						}

						let strNewVIStatus;
						let text = texts.verificationRequestCompletedWithStatus(vrStatusDescription);
						if (vi_vr_status === 'accredited') {
							strNewVIStatus = 'accredited';
						} else {
							strNewVIStatus = 'not_accredited';
							text += '\n\n' + texts.currentAttestationFailed();
						}

						db.query(
							`UPDATE transactions
							SET vi_status=?, vi_vr_status=?, result_date=${db.getNow()}
							WHERE transaction_id=?`,
							[strNewVIStatus, vi_vr_status, transaction_id],
							() => {
								unlock();
								handles.checkVerificationRequest(null, strNewVIStatus === 'accredited' ? transaction_id : false);
							}
						);

						device.sendMessageToDevice(device_address, 'text', text);

					}
				);
			}); // mutex.lock(['tx-' + transaction_id]
		}
	);

	res.status(200).end();
});

server.setHandlerCheckVerificationRequest = (handler) => {
	handles.checkVerificationRequest = handler;
};

module.exports = server;