const conf = require('byteballcore/conf');

function parseSrcProfile(row) {
	if (!conf.bRequireRealName) {
		row.src_profile = {};
	} else {
		if (!row.src_profile) {
			row.src_profile = {};
		} else {
			row.src_profile = JSON.parse(row.src_profile);
		}
	}
}


exports.parseSrcProfile = parseSrcProfile;
