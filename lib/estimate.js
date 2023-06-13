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
    copy.eei = runState.eei.copy();
    delete copy.interpreter;
    delete copy.env.block;
    delete copy._branching;
    runState._checkpoints.push(copy);
};
const numberToHex = (n) => n.toHexString ? n.toHexString() : ethers_1.ethers.hexlify(ethers_1.ethers.toBeArray(n));
const makeUnsignedTransaction = (provider, txParams) => __awaiter(void 0, void 0, void 0, function* () {
    const gasPrice = txParams.maxFeePerGas || txParams.gasPrice
        ? undefined
        : (yield provider.getFeeData()).maxFeePerGas;
    const gasLimit = txParams.gasLimit || BigInt(10e6);
    const params = Object.assign({ gasPrice, gasLimit }, Object.assign(Object.assign({}, txParams), { v: "", r: "", s: "" }));
    if (!gasPrice)
        delete params.gasPrice;
    else
        params.gasPrice = numberToHex(params.gasPrice);
    if (!gasLimit)
        delete params.gasLimit;
    else
        params.gasLimit = numberToHex(params.gasLimit);
    const tx = Object.create(tx_1.Transaction.fromTxData(params));
    const { from } = txParams;
    tx.getSenderAddress = () => addressFromHex(from);
    return tx;
});
const pop = (runState) => {
    if (!runState._checkpoints)
        runState._checkpoints = [];
    Object.assign(runState, runState._checkpoints.pop());
};
const bufferToHex = (v) => '0x' + v.toString('hex');
function mutateVMForHypotheticals(vm, provider) {
    const handlers = new Map(...[vm.evm._handlers.entries()]);
    const originalJumpi = handlers.get(OP_JUMPI);
    const storageLoad = vm.eei.storageLoad;
    const proxy = vm;
    proxy.eei = vm.eei;
    const touched = {};
    const _storageLoad = function (address, key, original = false) {
        return __awaiter(this, void 0, void 0, function* () {
            return Buffer.from(ethers_1.ethers.toBeArray(ethers_1.ethers.zeroPadValue(yield provider.getStorageAt(ethers_1.ethers.getAddress(address.toString()), ethers_1.ethers.hexlify(key)), 0x20)));
        });
    };
    proxy.eei.storageLoad = function (...args) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield _storageLoad.apply(this, args);
            return result;
        });
    };
    proxy.eei.getExternalBalance = (address) => __awaiter(this, void 0, void 0, function* () {
        return Buffer.from(ethers_1.ethers.toBeArray(yield provider.getBalance(ethers_1.ethers.getAddress(address.toString()))));
    });
    proxy.eei.getContractCode = function (address) {
        return __awaiter(this, void 0, void 0, function* () {
            return Buffer.from((yield provider.getCode(ethers_1.ethers.getAddress(address.toString()))).substr(2), "hex");
        });
    };
    handlers.set(OP_JUMPI, (runState) => {
        if (!runState._branching) {
            const copy = Object.assign({}, runState);
            delete copy._checkpoints;
            checkpoint(runState);
        }
        runState._branching = false;
        return originalJumpi(runState);
    });
    handlers.set(OP_REVERT, (runState) => {
        const copy = Object.assign({}, runState);
        delete copy._checkpoints;
        pop(runState);
        const [cond, dest] = runState.stack.popN(2);
        runState.stack.push(dest);
        runState.stack.push(Number(cond) ? BigInt(0) : BigInt(1));
        runState._branching = true;
    });
    proxy.evm._handlers = handlers;
    return proxy;
}
exports.mutateVMForHypotheticals = mutateVMForHypotheticals;
function estimateGas(provider, txParams) {
    return __awaiter(this, void 0, void 0, function* () {
        const vm = yield vm_1.VM.create();
        vm.DEBUG = true;
        const proxy = mutateVMForHypotheticals(vm, provider);
        const block = yield proxy.runTx({
            tx: yield makeUnsignedTransaction(provider, txParams),
            skipBalance: true,
        });
        return block;
    });
}
exports.estimateGas = estimateGas;
//# sourceMappingURL=estimate.js.map