var vm = require('@ethereumjs/vm');
var util = require('@ethereumjs/util');
var ethers = require('ethers');
var wallet = ethers.Wallet.createRandom();
var {Transaction } = require('@ethereumjs/tx');

var tx = Transaction.fromTxData({ data:'0x0101', from: wallet.address, v: '', r: '', s:'' });
