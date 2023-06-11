import { VM } from "@ethereumjs/vm";

const OP_JUMPI = Number(0x57);
const OP_REVERT = Number(0xfd);

const checkpoint = (runState: any) => {
  if (!runState._checkpoints) runState._checkpoints = [];
  const copy = clone(runState);
  delete copy._checkpoints;
  runState._checkpoints.push(clone(runState));
};

const pop = (runState: any) => {
  if (!runState._checkpoints) runState._checkpoints = [];
  Object.assign(runState, runState._checkpoints.pop()); 
};
 

export function mutateVMForHypotheticals(vm: any) {
  const handlers = new Map(...[vm.evm._handlers.entries()]); 
  const originalJumpi = handlers.get(OP_JUMPI);
  const originalRevert = handlers.get(OP_REVERT);
  handlers.set(OP_JUMPI, (runState: any) => {
    checkpoint(runState);
    return originalJumpi(runState);
  });
  handlers.set(OP_REVERT, (runState: any) => {
    pop(runState);
    const [ dest, cond ] = runState.stack.popN(2);
    runState.stack.push(dest);
    runState.stack.push(Number(cond) ? BigInt(0) : BigInt(1));
    return originalJumpi(runState);
  });
}
  
