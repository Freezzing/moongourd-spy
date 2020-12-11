"use strict";

const DefaultSettings = {
	"autoCheckAtInspect": true,
	"continentsToCheck": [
		{
			"continent": 3102,
			"boss": 1000,
			"name": "DAN",
			"desired": 15
		},
		{
			"continent": 3202,
			"boss": 1000,
			"name": "DAH",
			"desired": 10
		},
		{
			"continent": 3103,
			"boss": 1000,
			"name": "FAU",
			"desired": 12
		},
		{
			"continent": 456,
			"boss": 1003,
			"name": "TSH",
			"desired": 10
		}
	],
	"keepContinentsSequence": true,
	"useDesired": false
}

module.exports = function MigrateSettings(from_ver, to_ver, settings) {
	if (from_ver === undefined) {
		// Migrate legacy config file
		return { ...DefaultSettings, ...settings };
	} else if (from_ver === null) {
		// No config file exists, use default settings
		return DefaultSettings;
	} else {
		// Migrate from older version (using the new system) to latest one
		if (from_ver + 1 < to_ver) {
			// Recursively upgrade in one-version steps
			settings = MigrateSettings(from_ver, from_ver + 1, settings);
			return MigrateSettings(from_ver + 1, to_ver, settings);
		}

		switch (to_ver) {
			case 2:
				settings.keepContinentsSequence = false;
				break;
		}

		return settings;
	}
};