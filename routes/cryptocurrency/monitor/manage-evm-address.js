const { ethers } = require("ethers");

// 🧍 Independent EVM address storage
let evmMonitoredAddresses = new Set([
  "0x9BaCAE40B87D1C9856707DF3b3EEee6D8b786D5d",
  "0x9cA02A742866Cd0ca28f0310852644B0A2C5c8e1",
  "0x7e9883e1D837001bEf4c0C5900dB45cB476926ca",
  "0x324d58e9F0cd73dE3F81F44D33c0f058269Ceb67",
  "0x967477F1078656bb58486FE1c84216557049e644",
  "0x16D399bfeDCCC4c852002bb19D36dBc7Ea55A4f8",
  "0x4647C2508AD79F9C6E7813B94bE39B2CC8D77343",
  "0xF6b8138e975aDbaBC04147e4e4689C4fe893b61b",
].map((addr) => addr.toLowerCase()));

// 🔧 Independent EVM address management functions
function addEvmMonitoredAddress(address) {
  const normalizedAddress = address.toLowerCase();
  if (ethers.isAddress(normalizedAddress)) {
    evmMonitoredAddresses.add(normalizedAddress);
    console.log(`✅ Added new EVM address to monitoring: ${normalizedAddress}`);
    return { status: true, address: normalizedAddress, message: "EVM address added successfully" };
  } else {
    console.log(`❌ Invalid EVM address format: ${address}`);
    return { status: false, address: address, message: "Invalid EVM address format" };
  }
}

function removeEvmMonitoredAddress(address) {
  const normalizedAddress = address.toLowerCase();
  if (evmMonitoredAddresses.has(normalizedAddress)) {
    evmMonitoredAddresses.delete(normalizedAddress);
    console.log(`🗑️ Removed EVM address from monitoring: ${normalizedAddress}`);
    return { status: true, address: normalizedAddress, message: "EVM address removed successfully" };
  } else {
    console.log(`❌ EVM address not found in monitoring list: ${address}`);
    return { status: false, address: address, message: "EVM address not found in monitoring list" };
  }
}

function getEvmMonitoredAddresses() {
  return Array.from(evmMonitoredAddresses);
}

function isEvmAddressMonitored(address) {
  return evmMonitoredAddresses.has(address.toLowerCase());
}

module.exports = {
  getEvmMonitoredAddresses,
  addEvmMonitoredAddress,
  removeEvmMonitoredAddress,
  isEvmAddressMonitored
};
