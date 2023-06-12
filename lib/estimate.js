"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimateGas = exports.mutateVMForHypotheticals = void 0;
const ethers_1 = require("ethers");
const clone_1 = __importDefault(require("clone"));
const vm_1 = require("@ethereumjs/vm");
const tx_1 = require("@ethereumjs/tx");
const util_1 = require("@ethereumjs/util");
const addressFromHex = (s) => new util_1.Address(Buffer.from(ethers_1.ethers.toBeArray(s)));
const OP_JUMPI = Number(0x57);
const OP_REVERT = Number(0xfd);
const checkpoint = (runState) => {
    if (!runState._checkpoints)
        runState._checkpoints = [];
    const copy = (0, clone_1.default)(runState);
    delete copy._checkpoints;
    runState._checkpoints.push((0, clone_1.default)(runState));
};
const makeUnsignedTransaction = (txParams) => {
    const tx = Object.create(tx_1.Transaction.fromTxData(Object.assign(Object.assign({}, txParams), { v: '', r: '', s: '' })));
    const { from } = txParams;
    tx.getSenderAddress = () => addressFromHex(from);
    return tx;
};
const pop = (runState) => {
    if (!runState._checkpoints)
        runState._checkpoints = [];
    Object.assign(runState, runState._checkpoints.pop());
};
function mutateVMForHypotheticals(vm, provider) {
    const handlers = new Map(...[vm.evm._handlers.entries()]);
    const originalJumpi = handlers.get(OP_JUMPI);
    vm.eei.provider = provider;
    const storageLoad = vm.eei.storageLoad;
    const proxy = vm;
    proxy.eei = vm.eei;
    proxy.eei.storageLoad = function (address, key, original = false) {
        return __awaiter(this, void 0, void 0, function* () {
            if (original)
                return Buffer.from(ethers_1.ethers.toBeArray(yield provider.getStorageAt(ethers_1.ethers.getAddress(ethers_1.ethers.zeroPadValue(ethers_1.ethers.hexlify(address), 20)), ethers_1.ethers.zeroPadValue(ethers_1.ethers.hexlify(key), 0x20))));
            else
                return storageLoad.call(this, address, key, original);
        });
    };
    proxy.eei.getExternalBalance = (address) => __awaiter(this, void 0, void 0, function* () {
        return Buffer.from(ethers_1.ethers.toBeArray(yield provider.getBalance(ethers_1.ethers.getAddress(ethers_1.ethers.zeroPadValue(ethers_1.ethers.hexlify(ethers_1.ethers.toBeArray(address)), 20)))));
    });
    proxy.eei.getContractCode = function (address) {
        return __awaiter(this, void 0, void 0, function* () {
            return Buffer.from(ethers_1.ethers.toBeArray(yield provider.getCode(ethers_1.ethers.getAddress(ethers_1.ethers.hexlify(ethers_1.ethers.toBeArray(address))))));
        });
    };
    handlers.set(OP_JUMPI, (runState) => {
        console.log('woop');
        checkpoint(runState);
        return originalJumpi(runState);
    });
    handlers.set(OP_REVERT, (runState) => {
        pop(runState);
        const [dest, cond] = runState.stack.popN(2);
        runState.stack.push(dest);
        runState.stack.push(Number(cond) ? BigInt(0) : BigInt(1));
        //    return originalJumpi(runState);
    });
    proxy.evm._handlers = handlers;
    return proxy;
}
exports.mutateVMForHypotheticals = mutateVMForHypotheticals;
function estimateGas(provider, txParams) {
    return __awaiter(this, void 0, void 0, function* () {
        const vm = yield vm_1.VM.create();
        const proxy = mutateVMForHypotheticals(vm, provider);
        const block = yield proxy.runTx({ tx: makeUnsignedTransaction(txParams), skipBalance: true });
        return block;
    });
}
exports.estimateGas = estimateGas;
;
//# sourceMappingURL=estimate.js.map