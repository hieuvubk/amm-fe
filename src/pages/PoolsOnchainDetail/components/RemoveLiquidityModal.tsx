import { Dialog } from '@material-ui/core';
import classnames from 'classnames/bind';
import React, { FC, useState } from 'react';
import { getSigner, OnchainPool, txExitPool } from 'src/services/poolOnchain';
import styles from './modal.module.scss';

const cx = classnames.bind(styles);
type TxStatus = 'idle' | 'pending' | 'success' | 'error';

interface Props {
  open: boolean;
  onClose: () => void;
  pool: OnchainPool;
  userLp: string;
  rpcUrl: string;
  onSuccess: () => void;
}

const RemoveLiquidityModal: FC<Props> = ({ open, onClose, pool, userLp, rpcUrl, onSuccess }) => {
  const [lpAmount, setLpAmount] = useState('');
  const [slippage, setSlippage] = useState('1');
  const [status, setStatus] = useState<TxStatus>('idle');
  const [statusMsg, setStatusMsg] = useState('');

  const reset = () => { setLpAmount(''); setStatus('idle'); setStatusMsg(''); };
  const handleClose = () => { reset(); onClose(); };

  // Estimated tokens out (proportional)
  const estimatedOut = (): { symbol: string; amount: string }[] => {
    if (!lpAmount || parseFloat(lpAmount) <= 0 || parseFloat(pool.totalSupply) === 0) return [];
    const ratio = parseFloat(lpAmount) / parseFloat(pool.totalSupply);
    return pool.tokens.map((t) => ({
      symbol: t.symbol,
      amount: (parseFloat(t.balance) * ratio * (1 - parseFloat(slippage) / 100)).toFixed(6),
    }));
  };

  const handleMax = () => setLpAmount(parseFloat(userLp).toFixed(6));

  const handleSubmit = async () => {
    if (!lpAmount || parseFloat(lpAmount) <= 0) return;
    try {
      setStatus('pending');
      setStatusMsg('Submitting transaction...');
      const signer = await getSigner(rpcUrl);
      await txExitPool(pool.address, pool.tokens, lpAmount, parseFloat(slippage), rpcUrl, signer);
      setStatus('success');
      setStatusMsg('Liquidity removed successfully!');
      onSuccess();
    } catch (e: any) {
      setStatus('error');
      setStatusMsg(e?.message || 'Transaction failed');
    }
  };

  const estimates = estimatedOut();
  const isBusy = status === 'pending';

  return (
    <Dialog open={open} onClose={handleClose} PaperProps={{ className: cx('dialog-paper') }}>
      <div className={cx('modal-header')}>
        <h3>Remove Liquidity</h3>
        <button className={cx('close-btn')} onClick={handleClose}>✕</button>
      </div>

      <div className={cx('modal-body')}>
        <div className={cx('info-row')}>
          <span>Your LP Balance</span>
          <span>{parseFloat(userLp).toFixed(6)} BPT</span>
        </div>

        <hr className={cx('divider')} />

        <div className={cx('input-group')}>
          <label>LP Tokens to Remove (BPT)</label>
          <div className={cx('input-wrap')}>
            <input
              type="number"
              min="0"
              max={userLp}
              placeholder="0.0"
              value={lpAmount}
              onChange={(e) => setLpAmount(e.target.value)}
            />
            <button
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', fontSize: 12 }}
              onClick={handleMax}
            >
              MAX
            </button>
            <span className={cx('input-suffix')}>BPT</span>
          </div>
        </div>

        {estimates.length > 0 && (
          <>
            <hr className={cx('divider')} />
            <div style={{ fontSize: 12, color: 'var(--body-text)', marginBottom: 8, opacity: .7 }}>
              Estimated tokens out (after slippage)
            </div>
            <div className={cx('token-inputs')}>
              {estimates.map((e) => (
                <div className={cx('info-row')} key={e.symbol}>
                  <span>Min {e.symbol}</span>
                  <span>{e.amount}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <hr className={cx('divider')} />

        <div className={cx('slippage-row')}>
          <span>Slippage tolerance</span>
          <input
            type="number"
            min="0.1"
            max="50"
            step="0.1"
            value={slippage}
            onChange={(e) => setSlippage(e.target.value)}
          />
          <span>%</span>
        </div>

        {status !== 'idle' && (
          <div className={cx('status-box', {
            'status-box--pending': status === 'pending',
            'status-box--success': status === 'success',
            'status-box--error':   status === 'error',
          })}>
            {statusMsg}
          </div>
        )}
      </div>

      <div className={cx('modal-footer')}>
        <button className={cx('btn-cancel')} onClick={handleClose}>Cancel</button>
        <button
          className={cx('btn-primary')}
          disabled={isBusy || status === 'success' || !lpAmount || parseFloat(lpAmount) <= 0}
          onClick={handleSubmit}
        >
          {isBusy ? 'Removing...' : 'Remove Liquidity'}
        </button>
      </div>
    </Dialog>
  );
};

export default RemoveLiquidityModal;
