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
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimateGas = exports.mutateVMForHypotheticals = void 0;
const ethers_1 = require("ethers");
const vm_1 = require("@ethereumjs/vm");
const tx_1 = require("@ethereumjs/tx");
const util_1 = require("@ethereumjs/util");
const addressFromHex = (s) => new util_1.Address(Buffer.from(ethers_1.ethers.toBeArray(s)));
const OP_JUMPI = Number(0x57);
const OP_REVERT = Number(0xfd);
const copyMemory = (memory) => {
    const Memory = memory.constructor;
    const copy = new Memory();
    copy.write(0, memory._store.length, memory._store);
    return copy;
};
const copyStack = (stack) => {
    const Stack = stack.constructor;
    const copy = new Stack(stack._maxHeight);
    copy._store = stack._store.slice();
    return copy;
};
const copyInterpreter = (runState) => {
    const Interpreter = runState.interpreter.constructor;
    const copy = new Interpreter(runState.interpreter._evm, runState.eei, runState.env, runState.gasLeft);
    return copy;
};
const copyRunState = (runState) => {
    const stateManager = (runState.stateManager || runState.eei._stateManager).copy();
    const env = runState.env;
    const copy = {
        programCounter: runState.programCounter,
        opCode: runState.opCode,
        memory: copyMemory(runState.memory),
        memoryWordCount: runState.memoryWordCount,
        highestMemCost: runState.highestMemCost,
        stack: copyStack(runState.stack),
        returnStack: copyStack(runState.returnStack),
        code: runState.code,
        shouldDoJumpAnalysis: runState.shouldDoJumpAnalysis,
        validJumps: runState.validJumps,
        eei: runState.eei,
        env,
        messageGasLimit: runState.messageGasLimit,
        interpreter: copyInterpreter(runState),
        gasRefund: runState.gasRefund,
        gasLeft: runState.gasLeft,
        auth: runState.auth,
        returnBuffer: runState.returnBuffer
    };
    copy.interpreter._runState = copy;
    return copy;
};
const checkpoint = (runState) => {
    if (!runState._checkpoints)
        runState._checkpoints = [];
    const copy = copyRunState(runState);
    runState._checkpoints.push(copy);
};
const numberToHex = (n) => n.toHexString ? n.toHexString() : ethers_1.ethers.hexlify(ethers_1.ethers.toBeArray(n));
const makeUnsignedTransaction = (provider, txParams) => {
    const gasLimit = txParams.gasLimit || BigInt(10e6);
    const gasPrice = txParams.gasPrice || '0x00';
    const data = String(txParams.data);
    const params = Object.assign({ gasPrice, gasLimit }, Object.assign(Object.assign({}, txParams), { v: "", r: "", s: "" }), { data });
    if (!gasPrice)
        params.gasPrice = '0x00';
    else
        params.gasPrice = numberToHex(params.gasPrice);
    if (!gasLimit)
        delete params.gasLimit;
    else
        params.gasLimit = numberToHex(params.gasLimit);
    const tx = Object.create(tx_1.Transaction.fromTxData(params));
    const { from } = txParams;
    tx.getSenderAddress = () => addressFromHex(from);
    //  console.log({ data: '0x' + tx.data.toString('hex'), from, to: tx.to });
    return tx;
};
const pop = (runState) => {
    if (!runState._checkpoints)
        runState._checkpoints = [];
    const state = runState._checkpoints.pop();
    delete state._checkpoints;
    Object.assign(runState, state);
};
const bufferToHex = (v) => '0x' + v.toString('hex');
const logState = (tag, runState) => {
    console.log(tag + '>>');
    const copy = copyRunState(runState);
    delete copy.validJumps;
    delete copy._checkpoints;
    console.log(copy);
    console.log(tag + '<<');
};
function mutateVMForHypotheticals(vm, provider) {
    const handlers = new Map(...[vm.evm._handlers.entries()]);
    const originalJumpi = handlers.get(OP_JUMPI);
    const storageLoad = vm.eei.storageLoad;
    const proxy = vm;
    proxy.eei = vm.eei;
    const touched = {};
    const _storageLoad = function (address, key, original = false) {
        return __awaiter(this, void 0, void 0, function* () {
            return Buffer.from(ethers_1.ethers.toBeArray(ethers_1.ethers.zeroPadValue(yield provider.getStorage(ethers_1.ethers.getAddress(address.toString()), ethers_1.ethers.hexlify(key)), 0x20)));
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
        //logState('JUMPI', runState);
        if (!runState._branching) {
            checkpoint(runState);
        }
        else {
            runState._checkpoints.pop();
            const [dest, cond] = runState.stack.popN(2);
            runState.stack.push(Number(cond) ? BigInt(0) : BigInt(1));
            runState.stack.push(dest);
        }
        runState._branching = false;
        return originalJumpi(runState);
    });
    handlers.set(OP_REVERT, (runState) => {
        pop(runState);
        runState._branching = true;
        //logState('REVERT', runState);
        runState.programCounter--;
    });
    proxy.evm._handlers = handlers;
    return proxy;
}
exports.mutateVMForHypotheticals = mutateVMForHypotheticals;
function estimateGas(provider, txParams) {
    return __awaiter(this, void 0, void 0, function* () {
        const vm = yield vm_1.VM.create();
        const { isActivatedEIP } = vm._common;
        vm._common.isActivatedEIP = function (...args) {
            const [eip] = args;
            if (eip === 1559)
                return false;
            return isActivatedEIP.apply(vm._common, args);
        };
        vm.DEBUG = true;
        const proxy = mutateVMForHypotheticals(vm, provider);
        const block = yield proxy.runTx({
            tx: makeUnsignedTransaction(provider, txParams),
            skipNonce: true,
            skipBalance: true,
        });
        return block.totalGasSpent;
    });
}
exports.estimateGas = estimateGas;
//# sourceMappingURL=estimate.js.map