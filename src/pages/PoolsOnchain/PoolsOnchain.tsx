import { CircularProgress, Container } from '@material-ui/core';
import classnames from 'classnames/bind';
import React, { FC, useEffect, useState } from 'react';
import { withRouter } from 'react-router-dom';
import { DEFAULT_RPC, loadAllPools, OnchainPool, RPC_STORAGE_KEY } from 'src/services/poolOnchain';
import { useAppSelector } from 'src/store/hooks';
import styles from './PoolsOnchain.module.scss';

const cx = classnames.bind(styles);

const PoolsOnchain: FC<any> = ({ history }: any) => {
  useAppSelector((state) => state.theme.themeMode);
  const [pools, setPools] = useState<OnchainPool[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const savedRpc = localStorage.getItem(RPC_STORAGE_KEY) || DEFAULT_RPC;
  const [rpcUrl, setRpcUrl] = useState(savedRpc);
  const [inputRpc, setInputRpc] = useState(savedRpc);

  const fetchPools = async (url: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await loadAllPools(url);
      setPools(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load pools from chain');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPools(rpcUrl);
  }, [rpcUrl]);

  const shortAddr = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const handleConnect = () => {
    localStorage.setItem(RPC_STORAGE_KEY, inputRpc);
    setRpcUrl(inputRpc);
  };

  const handleRowClick = (poolAddress: string) => {
    history.push(`/pools-onchain/${poolAddress}`);
  };

  return (
    <Container className={cx('container')}>
      <div className={cx('header')}>
        <h2>POOLS (On-Chain)</h2>
        <div className={cx('rpc-row')}>
          <span>RPC URL:</span>
          <input
            className={cx('rpc-input')}
            value={inputRpc}
            onChange={(e) => setInputRpc(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
            placeholder="https://bsc-dataseed.binance.org/"
          />
          <button className={cx('rpc-btn')} onClick={handleConnect} disabled={loading}>
            Connect
          </button>
          <button className={cx('refresh-btn')} onClick={() => fetchPools(rpcUrl)} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      {loading && (
        <div className={cx('loading')}>
          <CircularProgress size={32} />
          <span>Loading pools from chain...</span>
        </div>
      )}

      {!loading && error && <div className={cx('error')}>{error}</div>}

      {!loading && !error && pools.length === 0 && (
        <div className={cx('empty')}>No pools found</div>
      )}

      {!loading && pools.length > 0 && (
        <div className={cx('table-wrapper')}>
          <table className={cx('pool-table')}>
            <thead>
              <tr>
                <th>Pool Address</th>
                <th>Tokens</th>
                <th>Swap Fee</th>
                <th>Total LP Supply</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pools.map((pool) => (
                <tr
                  key={pool.address}
                  className={cx('pool-row')}
                  onClick={() => handleRowClick(pool.address)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>
                    <span className={cx('address-link')}>{shortAddr(pool.address)}</span>
                  </td>
                  <td>
                    <div className={cx('tokens')}>
                      {pool.tokens.length > 0 ? (
                        pool.tokens.map((t) => (
                          <span key={t.address} className={cx('token-tag')}>
                            {t.symbol}
                            <span className={cx('weight')}>{t.normalizedWeight}</span>
                            <span className={cx('balance')}>({t.balance})</span>
                          </span>
                        ))
                      ) : (
                        <span className={cx('no-tokens')}>No tokens bound</span>
                      )}
                    </div>
                  </td>
                  <td>{pool.swapFee}</td>
                  <td>{pool.totalSupply}</td>
                  <td>
                    <div className={cx('status')}>
                      <span className={cx('badge', pool.isFinalized ? 'badge--green' : 'badge--gray')}>
                        {pool.isFinalized ? 'Finalized' : 'Draft'}
                      </span>
                      <span className={cx('badge', pool.isPublicSwap ? 'badge--blue' : 'badge--gray')}>
                        {pool.isPublicSwap ? 'Public' : 'Private'}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  );
};

export default withRouter(PoolsOnchain);
