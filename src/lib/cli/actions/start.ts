import { logger } from "../../logger/index.js";
import { startSwarm } from "../../swarm/index.js";
import { stringify } from "yaml";
import { writeFileSync } from "fs";
import { safeReadConfig } from "../../utils/config.js";
import { checkForUpdates } from "../../update.js";
import { makeKeys, encodeKeys, loadKeys } from "../../crypto/bls/keys.js";
import { encoder } from "../../crypto/base58/index.js";
import { toMurmur } from "../../crypto/murmur/index.js";
import {
  keys,
  config as globalConfig,
  nameRegex,
  murmur,
} from "../../constants.js";
import { runTasks } from "../../daemon/index.js";
import { initDB } from "../../db/db.js";
import assert from "node:assert";
import { minutes } from "../../utils/time.js";

interface StartOptions {
  log?: string;
  lite?: boolean;
  generate?: boolean;
  maxPeers?: string;
  parallelPeers?: string;
  infect?: string;
  die?: string;
}

export const startAction = async (
  configFile: string,
  options: StartOptions
) => {
  const config = safeReadConfig(configFile);
  if (!config) {
    return process.exit(1);
  }

  logger.level = options.log || config.log || "info";
  config.lite = options.lite || config.lite || false;

  // Peers
  config.peers ||= globalConfig.peers;
  config.peers.max =
    parseInt(options.maxPeers || "0") ||
    config.peers.max ||
    globalConfig.peers.max;

  config.peers.parallel =
    parseInt(options.parallelPeers || "0") ||
    config.peers.parallel ||
    globalConfig.peers.parallel;

  // TODO: We need sanity checks; e.g. did the user set jail time to a string?
  // Jailing
  config.jail ||= globalConfig.jail;

  config.jail.duration = config.jail.duration
    ? minutes(config.jail.duration)
    : globalConfig.jail.duration;

  config.jail.strikes = config.jail.strikes || globalConfig.jail.strikes;

  // Gossip
  config.gossip ||= globalConfig.gossip;

  if (Object.getPrototypeOf(config.gossip) !== Object.prototype) {
    logger.error("Invalid gossip option");
    return process.exit(1);
  }

  config.gossip.infect =
    parseInt(options.infect || "0") ||
    config.gossip.infect ||
    globalConfig.gossip.infect;

  config.gossip.die =
    parseInt(options.die || "0") ||
    config.gossip.die ||
    globalConfig.gossip.die;

  if (!config.secretKey && !options.generate) {
    logger.error("No secret key supplied");
    logger.warn("Run me with --generate to generate a new secret for you");
    return process.exit(1);
  }

  if (!config.secretKey && options.generate) {
    const newKeys = makeKeys();
    const encodedKeys = encodeKeys(newKeys);
    config.secretKey = encodedKeys.secretKey;
    config.publicKey = encodedKeys.publicKey;
    const serialized = stringify(config);
    writeFileSync(configFile, serialized);
  }

  await checkForUpdates();

  Object.assign(keys, loadKeys(config.secretKey));
  assert(keys.publicKey !== undefined, "No public key available");

  const address = encoder.encode(keys.publicKey.toBytes());
  murmur.address = await toMurmur(address);

  logger.info(`Unchained public address is ${address}`);
  logger.info(`Unchained gossip address is ${murmur.address}`);

  if (!config.name) {
    logger.warn("Node name not found in config");
    logger.warn("Using the first 8 letters of your public key");
    config.name = address.slice(0, 8);
  } else if (config.name.length > 24) {
    logger.error("Node name cannot be more than 24 characters");
    return process.exit(1);
  } else if (!config.name.match(nameRegex)) {
    logger.error(
      "Only English letters, numbers, and @._'- are allowed in the name"
    );
    return process.exit(1);
  }

  if (!config.lite && !config.database?.url) {
    logger.error("Database URL is not provided.");
    return process.exit(1);
  }

  Object.assign(globalConfig, config);

  if (!config.lite) {
    await initDB();
  }

  runTasks();
  startSwarm();
};
