import { CircularProgress, Container } from '@material-ui/core';
import classnames from 'classnames/bind';
import React, { FC, useEffect, useState } from 'react';
import { withRouter } from 'react-router-dom';
import {
  DEFAULT_RPC,
  fetchPoolData,
  getProvider,
  getSignerAddress,
  getUserLpBalance,
  OnchainPool,
  RPC_STORAGE_KEY,
} from 'src/services/poolOnchain';
import AddLiquidityModal from './components/AddLiquidityModal';
import RemoveLiquidityModal from './components/RemoveLiquidityModal';
import SwapModal from './components/SwapModal';
import styles from './PoolsOnchainDetail.module.scss';

const cx = classnames.bind(styles);

const PoolsOnchainDetail: FC<any> = ({ match, history }: any) => {
  const poolAddress: string = match.params.address;
  const rpcUrl = localStorage.getItem(RPC_STORAGE_KEY) || DEFAULT_RPC;

  const [pool, setPool] = useState<OnchainPool | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [userLp, setUserLp] = useState('0');
  const [addOpen, setAddOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);

  const loadPool = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchPoolData(getProvider(rpcUrl), poolAddress);
      setPool(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load pool');
    } finally {
      setLoading(false);
    }
  };

  const loadUserData = async () => {
    const addr = await getSignerAddress();
    setUserAddress(addr);
    if (addr) {
      const lp = await getUserLpBalance(poolAddress, addr, rpcUrl);
      setUserLp(lp);
    }
  };

  useEffect(() => {
    loadPool();
    loadUserData();
  }, [poolAddress]);

  const onTxSuccess = () => {
    loadPool();
    loadUserData();
  };

  const shortAddr = (addr: string) => `${addr.slice(0, 8)}...${addr.slice(-6)}`;

  if (loading) {
    return (
      <Container className={cx('container')}>
        <div className={cx('loading')}>
          <CircularProgress size={32} />
          <span>Loading pool data...</span>
        </div>
      </Container>
    );
  }

  if (error || !pool) {
    return (
      <Container className={cx('container')}>
        <button className={cx('back-btn')} onClick={() => history.push('/pools-onchain')}>← Back</button>
        <div className={cx('error')}>{error || 'Pool not found'}</div>
      </Container>
    );
  }

  return (
    <Container className={cx('container')}>
      <button className={cx('back-btn')} onClick={() => history.push('/pools-onchain')}>← Back to Pools</button>

      {/* ── Header ── */}
      <div className={cx('header')}>
        <div className={cx('address-row')}>
          <h2>{shortAddr(pool.address)}</h2>
          <a
            href={`${process.env.REACT_APP_ETHERSCAN}/address/${pool.address}`}
            target="_blank"
            rel="noreferrer"
          >
            View on explorer ↗
          </a>
        </div>

        <div className={cx('badges')}>
          <span className={cx('badge', pool.isFinalized ? 'badge--green' : 'badge--gray')}>
            {pool.isFinalized ? 'Finalized' : 'Draft'}
          </span>
          <span className={cx('badge', pool.isPublicSwap ? 'badge--blue' : 'badge--gray')}>
            {pool.isPublicSwap ? 'Public Swap' : 'Private Swap'}
          </span>
        </div>

        <div className={cx('stats-row')}>
          <div className={cx('stat')}>
            <span className={cx('stat__label')}>Swap Fee</span>
            <span className={cx('stat__value')}>{pool.swapFee}</span>
          </div>
          <div className={cx('stat')}>
            <span className={cx('stat__label')}>Total LP Supply</span>
            <span className={cx('stat__value')}>{pool.totalSupply} BPT</span>
          </div>
          <div className={cx('stat')}>
            <span className={cx('stat__label')}>Tokens</span>
            <span className={cx('stat__value')}>{pool.tokens.length}</span>
          </div>
        </div>
      </div>

      {/* ── Actions ── */}
      <div className={cx('actions')}>
        <button
          className={cx('btn-add')}
          disabled={!pool.isFinalized}
          onClick={() => setAddOpen(true)}
        >
          + Add Liquidity
        </button>
        <button
          className={cx('btn-remove')}
          disabled={!pool.isFinalized || parseFloat(userLp) <= 0}
          onClick={() => setRemoveOpen(true)}
        >
          − Remove Liquidity
        </button>
        <button
          className={cx('btn-swap')}
          disabled={!pool.isPublicSwap || pool.tokens.length < 2}
          onClick={() => setSwapOpen(true)}
        >
          ⇄ Swap
        </button>
      </div>

      {!userAddress && (
        <p className={cx('wallet-note')}>Connect MetaMask to enable transactions.</p>
      )}

      {/* ── Token table ── */}
      <div className={cx('section-title')}>Pool Tokens</div>
      <table className={cx('token-table')}>
        <thead>
          <tr>
            <th>Token</th>
            <th>Address</th>
            <th>Balance</th>
            <th>Weight</th>
          </tr>
        </thead>
        <tbody>
          {pool.tokens.map((t) => {
            const pct = parseFloat(t.normalizedWeight);
            return (
              <tr key={t.address}>
                <td><strong>{t.symbol}</strong></td>
                <td><span className={cx('mono')}>{shortAddr(t.address)}</span></td>
                <td>{t.balance}</td>
                <td>
                  <div className={cx('weight-bar-wrap')}>
                    <span>{t.normalizedWeight}</span>
                    <div className={cx('weight-bar')} style={{ width: `${Math.min(pct, 100)}px` }} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ── My LP Balance ── */}
      {userAddress && (
        <div className={cx('lp-box')}>
          <span className={cx('lp-box__label')}>My LP Balance</span>
          <span className={cx('lp-box__value')}>{parseFloat(userLp).toFixed(6)} BPT</span>
        </div>
      )}

      {/* ── Modals ── */}
      <AddLiquidityModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        pool={pool}
        rpcUrl={rpcUrl}
        onSuccess={onTxSuccess}
      />
      <RemoveLiquidityModal
        open={removeOpen}
        onClose={() => setRemoveOpen(false)}
        pool={pool}
        userLp={userLp}
        rpcUrl={rpcUrl}
        onSuccess={onTxSuccess}
      />
      <SwapModal
        open={swapOpen}
        onClose={() => setSwapOpen(false)}
        pool={pool}
        rpcUrl={rpcUrl}
        onSuccess={onTxSuccess}
      />
    </Container>
  );
};

export default withRouter(PoolsOnchainDetail);
