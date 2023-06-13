const { ethers } = require("ethers");
const { emasm } = require("emasm");
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
});
	
