export const BFactory = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'caller', type: 'address' },
      { indexed: true, internalType: 'address', name: 'pool', type: 'address' },
    ],
    name: 'LOG_NEW_POOL',
    type: 'event',
  },
  {
    inputs: [{ internalType: 'address', name: 'b', type: 'address' }],
    name: 'isBPool',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'newBPool',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];
