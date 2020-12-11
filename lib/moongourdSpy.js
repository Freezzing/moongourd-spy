"use strict";

const fetch = require("node-fetch");
const { start } = require("repl");
const url = require('url').URL;

const THROTTLE_REPEAT_DURATION = 500;

module.exports = function MoongourdParser(mod) {
	let throttleList = new Map();

	const secsToMinsString = (secs) => {
		return `${(secs / 60).toFixed(2)}mins`
	};

	const damageToMsString = (val) => {
		return `${(val / 1000000).toFixed(2)}`
	};

	const getLink = (ServerId, playerName, continent, boss) => {
		let region = "NA";
		switch (ServerId) {
			case (43):
			case (42): region = "NA"; break;
			default: region = "EU"; break;
		}
		mod.log(region);
		return `https://moongourd.com/api/mg/search.php?region=${region}&zone=${continent}&boss=${boss}&ver=1&name=${playerName}&page=1`
	};

	const requestData = async (link) => {
		const requestPayload = await fetch(link);
		if (!requestPayload.ok) return null;
		else {
			let res = null;
			try { res = await requestPayload.json(); }
			catch (e) { }
			return res;
		}
	};

	const correctNamesBecauseTeriIsSoBadInDev = (str) => {
		return str.replace(/\\u[\dA-F]{4}/gi, (match) => String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16)));

	};
	const isNumeric = (str) => {
		if (typeof str != "string") return false
		return !isNaN(str) &&
			!isNaN(parseFloat(str))
	}

	const cutData = (payload, charName) => {
		let sanitizedPayload = payload[1];
		let grouped = {};

		//group data by log id to ensure everything will be presented without clones
		for (let i = 0; i < sanitizedPayload.length; i++) {
			sanitizedPayload[i].playerName = correctNamesBecauseTeriIsSoBadInDev(sanitizedPayload[i].playerName);

			if (!grouped[sanitizedPayload[i].logId]) grouped[sanitizedPayload[i].logId] = {};

			let customData = {};
			if (sanitizedPayload[i].fightDuration) customData.fightDuration = sanitizedPayload[i].fightDuration;
			if (sanitizedPayload[i].partyDps) customData.partyDps = sanitizedPayload[i].partyDps;
			if (sanitizedPayload[i].timestamp) customData.timestamp = sanitizedPayload[i].timestamp;

			if (sanitizedPayload[i].playerName === charName) {
				customData.playerDps = sanitizedPayload[i].playerDps;
			}

			grouped[sanitizedPayload[i].logId] = Object.assign(grouped[sanitizedPayload[i].logId], customData);
		}

		return grouped;
	}

	const analyzeRuns = (grouped) => {
		let vals = Object.values(grouped);


		const playerDps = vals.map(x => x.playerDps).slice(0, 15);


		const avg = playerDps.reduce((accum, num) => num + accum, 0);

		const arrAvg = playerDps.reduce((a, b) => (a + b)) / playerDps.length;

		return {
			"playerDpsMin": damageToMsString(Math.min(...playerDps)),
			"playerDpsMax": damageToMsString(Math.max(...playerDps)),
			"recentAvg": damageToMsString(arrAvg)
		}
	};

	const analyzeChar = async (charName, continentId, bossId, dungeonName, desired) => {
		const link = getLink(mod.serverId, charName, continentId, bossId);
		let payload = await requestData(new url(link));

		if (!payload) {
			mod.command.message("Error happened in request!")
			return;
		}

		if (!Array.isArray(payload) || !Array.isArray(payload[1])) {
			mod.command.message("Invalid API response! Zone isn't supported by MG, server is not available or mod need update.")
			return;
		}

		if (payload[1].length === 0) {
			mod.command.message(`No data for ${dungeonName}`);
			return;
		}

		const grouped = cutData(payload, charName);
		const res = analyzeRuns(grouped);
		const skills = (res.recentAvg > desired) ? "Yes" : "No"

		if (mod.settings.useDesired)
			mod.command.message(`${dungeonName}: ${res.recentAvg} | ${res.playerDpsMin} | ${res.playerDpsMax} | ${skills}`)
		else
			mod.command.message(`${dungeonName}: ${res.recentAvg} | ${res.playerDpsMin} | ${res.playerDpsMax}`)
	};

	const startWrappedCheck = async (name) => {
		if (mod.settings.useDesired)
			mod.command.message(`${name}: Avg | Min | Max | desired`);
		else
			mod.command.message(`${name}: Avg | Min | Max`);
		if (mod.settings.keepContinentsSequence)
			for (const x of mod.settings.continentsToCheck) await analyzeChar(name, x.continent, x.boss, x.name, x.desired);
		else
			for (const x of mod.settings.continentsToCheck) analyzeChar(name, x.continent, x.boss, x.name, x.desired);
	};

	mod.hook('S_USER_PAPERDOLL_INFO', 11, event => {
		if (mod.settings.autoCheckAtInspect && event.name != mod.game.me.name) {

			if (throttleList.has(event.name) && Date.now() - throttleList.get(event.name) < THROTTLE_REPEAT_DURATION) return;

			throttleList.set(event.name, Date.now());

			startWrappedCheck(event.name);
		}
	});
	mod.command.add("ms", {
		$none() {
			mod.settings.autoCheckAtInspect = !mod.settings.autoCheckAtInspect;
			mod.command.message(`Automatic check at inspect was ${mod.settings.enabled ? "en" : "dis"}abled`);
		},
		seq() {
			mod.settings.keepContinentsSequence = !mod.settings.keepContinentsSequence;
			mod.command.message(`Slow check mode was ${mod.settings.keepContinentsSequence ? "en" : "dis"}abled`);
		},
		desired() {
			mod.settings.useDesired = !mod.settings.useDesired;
			mod.command.message(`Desired check was ${mod.settings.useDesired ? "en" : "dis"}abled`);
			if (mod.settings.useDesired) {
				mod.command.message("Desire Thresholds:");
				for (const x of mod.settings.continentsToCheck) mod.command.message(`${x.name}: ${x.desired}`);
			}
		},
		setDesired(name, dps) {
			if (!name || name === "") {
				mod.command.message("Invalid boss name");
				return;
			}
			if (!isNumeric(dps)) {
				mod.command.message(`Invalid DPS: ${dps}`);
				return;
			}
			for (const x of mod.settings.continentsToCheck) {
				if (x.name == name) {
					x.desired = parseFloat(dps);
					mod.command.message(`Setting ${name} to ${dps}`)
					return;
				}
			}
			mod.command.message(`Boss not found`);
		},
		i(name) {
			if (!name || name === "") {
				mod.command.message("Invalid nickname.");
				return;
			}

			startWrappedCheck(name);
		}
	}, this);
};
