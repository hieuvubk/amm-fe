import { ethers } from 'ethers';
import { BFactory } from 'src/constants/abi/BFactory';
import { BPool } from 'src/constants/abi/BPool';
import { erc20Abi } from 'src/constants/abi/erc20Abi';

export const BFACTORY_ADDRESS = '0x0e6190b6505c0FCeaDE157e303C07656e3Cd7863';
export const KNOWN_BPOOL_ADDRESS = '0xf68ddc977eB5C6678368242D3457A1E6B04275D2';
export const DEFAULT_RPC = 'http://realio-testnet.json-rpc.decentrio.ventures';
export const RPC_STORAGE_KEY = 'poolsOnchain_rpcUrl';

export interface OnchainToken {
  address: string;
  symbol: string;
  decimals: number;
  balance: string;
  balanceRaw: string;
  denormWeight: string;
  denormWeightRaw: string;
  normalizedWeight: string;
}

export interface OnchainPool {
  address: string;
  tokens: OnchainToken[];
  swapFee: string;
  swapFeeRaw: string;
  totalSupply: string;
  totalSupplyRaw: string;
  totalDenormWeightRaw: string;
  isFinalized: boolean;
  isPublicSwap: boolean;
}

export function getProvider(rpcUrl: string): ethers.providers.JsonRpcProvider {
  return new ethers.providers.JsonRpcProvider(rpcUrl);
}

export async function getSigner(rpcUrl: string = DEFAULT_RPC): Promise<ethers.Signer> {
  if (!(window as any).ethereum) throw new Error('No wallet detected. Please install MetaMask.');

  // Get the target chain ID from the RPC endpoint
  const targetNetwork = await getProvider(rpcUrl).getNetwork();
  const targetChainId = '0x' + targetNetwork.chainId.toString(16);

  const ethereum = (window as any).ethereum;
  await ethereum.request({ method: 'eth_requestAccounts' });

  const currentChainId: string = await ethereum.request({ method: 'eth_chainId' });

  if (currentChainId !== targetChainId) {
    try {
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetChainId }],
      });
    } catch (switchError: any) {
      // Chain not added to MetaMask yet — add it
      if (switchError.code === 4902) {
        await ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: targetChainId,
            chainName: 'Realio Testnet',
            rpcUrls: [rpcUrl],
            nativeCurrency: { name: 'RIO', symbol: 'RIO', decimals: 18 },
          }],
        });
      } else {
        throw switchError;
      }
    }
  }

  const provider = new ethers.providers.Web3Provider(ethereum);
  return provider.getSigner();
}

export async function getSignerAddress(): Promise<string | null> {
  try {
    const signer = await getSigner();
    return signer.getAddress();
  } catch {
    return null;
  }
}

function readPool(poolAddress: string, rpcUrl: string) {
  return new ethers.Contract(poolAddress, BPool, getProvider(rpcUrl));
}

function writePool(poolAddress: string, signer: ethers.Signer) {
  return new ethers.Contract(poolAddress, BPool, signer as any);
}

function writeToken(tokenAddress: string, signer: ethers.Signer) {
  return new ethers.Contract(tokenAddress, erc20Abi, signer as any);
}

async function getPoolAddressesFromFactory(provider: ethers.providers.Provider): Promise<string[]> {
  try {
    const factory = new ethers.Contract(BFACTORY_ADDRESS, BFactory, provider);
    const filter = factory.filters.LOG_NEW_POOL();
    const events = await factory.queryFilter(filter, 0, 'latest');
    return events.map((e) => (e.args?.pool as string).toLowerCase());
  } catch {
    return [];
  }
}

export async function fetchPoolData(provider: ethers.providers.Provider, poolAddress: string): Promise<OnchainPool> {
  const pool = new ethers.Contract(poolAddress, BPool, provider);

  const [isFinalized, isPublicSwap, swapFeeRaw, totalSupplyRaw, totalDenormWeightRaw] = await Promise.all([
    pool.isFinalized(),
    pool.isPublicSwap(),
    pool.getSwapFee(),
    pool.totalSupply(),
    pool.getTotalDenormalizedWeight(),
  ]);

  let tokenAddresses: string[] = [];
  try {
    tokenAddresses = await pool.getCurrentTokens();
  } catch {
    try {
      tokenAddresses = await pool.getFinalTokens();
    } catch {
      tokenAddresses = [];
    }
  }

  const tokens: OnchainToken[] = await Promise.all(
    tokenAddresses.map(async (tokenAddr) => {
      const token = new ethers.Contract(tokenAddr, erc20Abi, provider);
      const [symbol, decimals, balance, denormWeight] = await Promise.all([
        token.symbol().catch(() => `${tokenAddr.slice(0, 6)}...`),
        token.decimals().catch(() => 18),
        pool.getBalance(tokenAddr),
        pool.getDenormalizedWeight(tokenAddr),
      ]);
      const normalizedWeight = totalDenormWeightRaw.gt(0)
        ? `${denormWeight.mul(10000).div(totalDenormWeightRaw).toNumber() / 100}%`
        : '0%';
      return {
        address: tokenAddr,
        symbol,
        decimals,
        balance: parseFloat(ethers.utils.formatUnits(balance, decimals)).toFixed(4),
        balanceRaw: balance.toHexString(),
        denormWeight: ethers.utils.formatUnits(denormWeight, 18),
        denormWeightRaw: denormWeight.toHexString(),
        normalizedWeight,
      };
    }),
  );

  const swapFeeNum = parseFloat(ethers.utils.formatUnits(swapFeeRaw, 18)) * 100;
  return {
    address: poolAddress,
    tokens,
    swapFee: `${swapFeeNum.toFixed(4)}%`,
    swapFeeRaw: swapFeeRaw.toHexString(),
    totalSupply: parseFloat(ethers.utils.formatUnits(totalSupplyRaw, 18)).toFixed(4),
    totalSupplyRaw: totalSupplyRaw.toHexString(),
    totalDenormWeightRaw: totalDenormWeightRaw.toHexString(),
    isFinalized,
    isPublicSwap,
  };
}

export async function loadAllPools(rpcUrl: string): Promise<OnchainPool[]> {
  const provider = getProvider(rpcUrl);
  const factoryAddresses = await getPoolAddressesFromFactory(provider);
  const allAddresses = Array.from(new Set([KNOWN_BPOOL_ADDRESS.toLowerCase(), ...factoryAddresses]));
  const results = await Promise.allSettled(allAddresses.map((addr) => fetchPoolData(provider, addr)));
  return results
    .filter((r): r is PromiseFulfilledResult<OnchainPool> => r.status === 'fulfilled')
    .map((r) => r.value);
}

// ─── Transaction helpers ──────────────────────────────────────────────────────

async function ensureAllowance(
  tokenAddress: string,
  spender: string,
  amount: ethers.BigNumber,
  signer: ethers.Signer,
  rpcUrl: string,
  onApproving?: () => void,
): Promise<void> {
  // Read allowance via rpcUrl (not MetaMask provider) so it hits the correct chain
  const readToken = new ethers.Contract(tokenAddress, erc20Abi, getProvider(rpcUrl));
  const owner = await signer.getAddress();
  const allowance: ethers.BigNumber = await readToken.allowance(owner, spender);
  if (allowance.lt(amount)) {
    onApproving?.();
    const tx = await writeToken(tokenAddress, signer).approve(spender, ethers.constants.MaxUint256);
    await tx.wait();
  }
}

export async function txJoinswapExternAmountIn(
  poolAddress: string,
  tokenIn: OnchainToken,
  amountInHuman: string,
  slippagePct: number,
  rpcUrl: string,
  signer: ethers.Signer,
  onApproving: () => void,
): Promise<ethers.ContractReceipt> {
  const amountIn = ethers.utils.parseUnits(amountInHuman, tokenIn.decimals);

  const pool = readPool(poolAddress, rpcUrl);
  const [balance, weight, supply, totalDenorm, swapFee] = await Promise.all([
    pool.getBalance(tokenIn.address),
    pool.getDenormalizedWeight(tokenIn.address),
    pool.totalSupply(),
    pool.getTotalDenormalizedWeight(),
    pool.getSwapFee(),
  ]);

  // Balancer V1: tokenAmountIn must be <= 50% of pool balance
  const maxIn = balance.div(2);
  if (amountIn.gt(maxIn)) {
    const maxHuman = parseFloat(ethers.utils.formatUnits(maxIn, tokenIn.decimals)).toFixed(6);
    throw new Error(`Amount too large. Max single-asset deposit is ${maxHuman} ${tokenIn.symbol} (50% of pool balance).`);
  }

  await ensureAllowance(tokenIn.address, poolAddress, amountIn, signer, rpcUrl, onApproving);

  const lpOut: ethers.BigNumber = await pool.calcPoolOutGivenSingleIn(balance, weight, supply, totalDenorm, amountIn, swapFee);
  const minLpOut = lpOut.mul(Math.round((1 - slippagePct / 100) * 1000)).div(1000);

  const tx = await writePool(poolAddress, signer).joinswapExternAmountIn(tokenIn.address, amountIn, minLpOut);
  return tx.wait();
}

export async function txJoinPool(
  poolAddress: string,
  tokens: OnchainToken[],
  poolAmountOutHuman: string,
  slippagePct: number,
  rpcUrl: string,
  signer: ethers.Signer,
  onApproving: () => void,
): Promise<ethers.ContractReceipt> {
  const pool = readPool(poolAddress, rpcUrl);
  const totalSupply: ethers.BigNumber = await pool.totalSupply();
  const poolAmountOut = ethers.utils.parseEther(poolAmountOutHuman);
  const slippageMul = Math.round((1 + slippagePct / 100) * 1000);

  const maxAmountsIn: ethers.BigNumber[] = await Promise.all(
    tokens.map(async (t) => {
      const bal: ethers.BigNumber = await pool.getBalance(t.address);
      return bal.mul(poolAmountOut).div(totalSupply).mul(slippageMul).div(1000);
    }),
  );

  onApproving();
  for (let i = 0; i < tokens.length; i++) {
    await ensureAllowance(tokens[i].address, poolAddress, maxAmountsIn[i], signer, rpcUrl);
  }

  const tx = await writePool(poolAddress, signer).joinPool(poolAmountOut, maxAmountsIn);
  return tx.wait();
}

export async function txExitPool(
  poolAddress: string,
  tokens: OnchainToken[],
  poolAmountInHuman: string,
  slippagePct: number,
  rpcUrl: string,
  signer: ethers.Signer,
): Promise<ethers.ContractReceipt> {
  const pool = readPool(poolAddress, rpcUrl);
  const totalSupply: ethers.BigNumber = await pool.totalSupply();
  const poolAmountIn = ethers.utils.parseEther(poolAmountInHuman);
  const slippageMul = Math.round((1 - slippagePct / 100) * 1000);

  const minAmountsOut: ethers.BigNumber[] = await Promise.all(
    tokens.map(async (t) => {
      const bal: ethers.BigNumber = await pool.getBalance(t.address);
      return bal.mul(poolAmountIn).div(totalSupply).mul(slippageMul).div(1000);
    }),
  );

  const tx = await writePool(poolAddress, signer).exitPool(poolAmountIn, minAmountsOut);
  return tx.wait();
}

export async function txSwapExactAmountIn(
  poolAddress: string,
  tokenIn: OnchainToken,
  tokenOut: OnchainToken,
  amountInHuman: string,
  slippagePct: number,
  rpcUrl: string,
  signer: ethers.Signer,
  onApproving: () => void,
): Promise<ethers.ContractReceipt> {
  const amountIn = ethers.utils.parseUnits(amountInHuman, tokenIn.decimals);
  await ensureAllowance(tokenIn.address, poolAddress, amountIn, signer, rpcUrl, onApproving);

  const pool = readPool(poolAddress, rpcUrl);
  const [balanceIn, weightIn, balanceOut, weightOut, swapFee] = await Promise.all([
    pool.getBalance(tokenIn.address),
    pool.getDenormalizedWeight(tokenIn.address),
    pool.getBalance(tokenOut.address),
    pool.getDenormalizedWeight(tokenOut.address),
    pool.getSwapFee(),
  ]);
  const estimatedOut: ethers.BigNumber = await pool.calcOutGivenIn(balanceIn, weightIn, balanceOut, weightOut, amountIn, swapFee);
  const minAmountOut = estimatedOut.mul(Math.round((1 - slippagePct / 100) * 1000)).div(1000);

  const tx = await writePool(poolAddress, signer).swapExactAmountIn(
    tokenIn.address, amountIn, tokenOut.address, minAmountOut, ethers.constants.MaxUint256,
  );
  return tx.wait();
}

// ─── Read-only estimates for UI ───────────────────────────────────────────────

export async function estimateSwapOut(
  poolAddress: string,
  tokenIn: OnchainToken,
  tokenOut: OnchainToken,
  amountInHuman: string,
  rpcUrl: string,
): Promise<string> {
  if (!amountInHuman || Number(amountInHuman) <= 0) return '0';
  const pool = readPool(poolAddress, rpcUrl);
  const [balanceIn, weightIn, balanceOut, weightOut, swapFee] = await Promise.all([
    pool.getBalance(tokenIn.address),
    pool.getDenormalizedWeight(tokenIn.address),
    pool.getBalance(tokenOut.address),
    pool.getDenormalizedWeight(tokenOut.address),
    pool.getSwapFee(),
  ]);
  const amountIn = ethers.utils.parseUnits(amountInHuman, tokenIn.decimals);
  const out: ethers.BigNumber = await pool.calcOutGivenIn(balanceIn, weightIn, balanceOut, weightOut, amountIn, swapFee);
  return parseFloat(ethers.utils.formatUnits(out, tokenOut.decimals)).toFixed(6);
}

export async function estimateSingleAssetLpOut(
  poolAddress: string,
  tokenIn: OnchainToken,
  amountInHuman: string,
  rpcUrl: string,
): Promise<{ lpOut: string; maxIn: string }> {
  if (!amountInHuman || Number(amountInHuman) <= 0) return { lpOut: '0', maxIn: '' };
  const pool = readPool(poolAddress, rpcUrl);
  const [balance, weight, supply, totalDenorm, swapFee] = await Promise.all([
    pool.getBalance(tokenIn.address),
    pool.getDenormalizedWeight(tokenIn.address),
    pool.totalSupply(),
    pool.getTotalDenormalizedWeight(),
    pool.getSwapFee(),
  ]);
  const maxIn = balance.div(2);
  const maxInHuman = parseFloat(ethers.utils.formatUnits(maxIn, tokenIn.decimals)).toFixed(6);
  const amountIn = ethers.utils.parseUnits(amountInHuman, tokenIn.decimals);
  if (amountIn.gt(maxIn)) {
    throw new Error(`ERR_MAX_IN_RATIO: max is ${maxInHuman} ${tokenIn.symbol}`);
  }
  const lpOut: ethers.BigNumber = await pool.calcPoolOutGivenSingleIn(balance, weight, supply, totalDenorm, amountIn, swapFee);
  return { lpOut: parseFloat(ethers.utils.formatEther(lpOut)).toFixed(6), maxIn: maxInHuman };
}

export async function getUserLpBalance(poolAddress: string, userAddress: string, rpcUrl: string): Promise<string> {
  try {
    const pool = readPool(poolAddress, rpcUrl);
    const bal: ethers.BigNumber = await pool.balanceOf(userAddress);
    return ethers.utils.formatEther(bal);
  } catch {
    return '0';
  }
}
