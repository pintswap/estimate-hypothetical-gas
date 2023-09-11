const { ethers } = require("ethers");
const { emasm } = require("emasm");
const { expect } = require("chai");
const { estimateGas } = require("..");

const provider = new ethers.InfuraProvider('mainnet');

describe('estimate-hypothetical-gas', () => {
  it('should correctly avoid revert', async () => {
    const data = emasm([
      '0x1',
      'should-not-reach',
      'jumpi',
      '0x1',
      '0x0',
      'mstore',
      '0x20',
      '0x0',
      'return',
      ['should-not-reach', ['0x0', '0x0', 'revert']]
    ]);
    const wallet = ethers.Wallet.createRandom();
    const from = wallet.address;
    const result = await estimateGas(provider, {
      from,
      data
    });
    console.log(result);
  });
  it('should evaluate a tx script', async () => {
    const result = await estimateGas(provider, {
      data: '0x583d60e43d3d73a0b86991c6218b36c1d19d4a2e9eb0ce3606eb485a7fd505accf00000000000000000000000000000000000000000000000000000000600052733a4c85e9e019107da15d21e1bd30d8e96f262061600452306024526305f5e100604452636500c1de606452601c6084527f4bb0147dbe52df46ff70ff6a5d798539f2793420fc215accdd78bd086bc85d9460a4527f71d5b53f3ce14dae6c700043000b37100986c0827568e4fa7af4a30487e7051560c452f16000600060646000600073a0b86991c6218b36c1d19d4a2e9eb0ce3606eb485a7f23b872dd00000000000000000000000000000000000000000000000000000000600052733a4c85e9e019107da15d21e1bd30d8e96f26206160045273bcd86368fd252b285b8ba9213313444ea93e18a16024526305f5e100604452f11660006000610184600060006e22d473030f116ddee9f6b43ac78ba35a7f30f28b7a0000000000000000000000000000000000000000000000000000000060005273c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2600452670de0b6b3a76400006024526364ff7063604452636500c1e360645230608452670de0b6b3a764000060a45273bcd86368fd252b285b8ba9213313444ea93e18a160c45261010060e4526041610104527fbe156c7d7d9af27b6f614e65a80f5606b9a0c31bdb6625f88d6162c40f025b2b610124527f444964c4e470d26a54887c653003c39a1c5cb5efd36cd0f4e580334b0cf585c1610144527f1b0000000000000000000000000000000000000000000000000000000000000061016452f1166000600060246000600073c02aaa39b223fe8d0a0e5c4f27ead9083c756cc25a7f2e1a7d4d00000000000000000000000000000000000000000000000000000000600052670de0b6b3a7640000600452f1166000600060006000670de0b6b3a7640000733a4c85e9e019107da15d21e1bd30d8e96f2620615af116156102e75773bcd86368fd252b285b8ba9213313444ea93e18a1ff5b60006000fd',
      from: '0xa5C5b0e9CB7514140DBB0fAD85348c0520a8DaC6',
      gasPrice: '0x00'
    });
    console.log(result);
  });
});
	
