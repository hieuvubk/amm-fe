import { Dialog } from '@material-ui/core';
import classnames from 'classnames/bind';
import React, { FC, useEffect, useState } from 'react';
import { estimateSwapOut, getSigner, OnchainPool, OnchainToken, txSwapExactAmountIn } from 'src/services/poolOnchain';
import styles from './modal.module.scss';

const cx = classnames.bind(styles);
type TxStatus = 'idle' | 'approving' | 'pending' | 'success' | 'error';

interface Props {
  open: boolean;
  onClose: () => void;
  pool: OnchainPool;
  rpcUrl: string;
  onSuccess: () => void;
}

const SwapModal: FC<Props> = ({ open, onClose, pool, rpcUrl, onSuccess }) => {
  const [tokenIn, setTokenIn] = useState<OnchainToken>(pool.tokens[0]);
  const [tokenOut, setTokenOut] = useState<OnchainToken>(pool.tokens[1] ?? pool.tokens[0]);
  const [amountIn, setAmountIn] = useState('');
  const [estimatedOut, setEstimatedOut] = useState('');
  const [slippage, setSlippage] = useState('1');
  const [status, setStatus] = useState<TxStatus>('idle');
  const [statusMsg, setStatusMsg] = useState('');

  // Auto-estimate on amount/token change
  useEffect(() => {
    if (!amountIn || parseFloat(amountIn) <= 0 || tokenIn.address === tokenOut.address) {
      setEstimatedOut('');
      return;
    }
    estimateSwapOut(pool.address, tokenIn, tokenOut, amountIn, rpcUrl)
      .then(setEstimatedOut)
      .catch(() => setEstimatedOut(''));
  }, [amountIn, tokenIn, tokenOut]);

  const reset = () => { setAmountIn(''); setEstimatedOut(''); setStatus('idle'); setStatusMsg(''); };
  const handleClose = () => { reset(); onClose(); };

  const handleFlip = () => {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmountIn('');
    setEstimatedOut('');
  };

  const handleTokenInChange = (address: string) => {
    const t = pool.tokens.find((x) => x.address === address);
    if (!t) return;
    setTokenIn(t);
    if (t.address === tokenOut.address) {
      const other = pool.tokens.find((x) => x.address !== address);
      if (other) setTokenOut(other);
    }
    setAmountIn('');
  };

  const handleTokenOutChange = (address: string) => {
    const t = pool.tokens.find((x) => x.address === address);
    if (!t) return;
    setTokenOut(t);
    if (t.address === tokenIn.address) {
      const other = pool.tokens.find((x) => x.address !== address);
      if (other) setTokenIn(other);
    }
  };

  const handleSubmit = async () => {
    if (!amountIn || parseFloat(amountIn) <= 0) return;
    try {
      setStatus('approving');
      setStatusMsg('Approving token...');
      const signer = await getSigner(rpcUrl);
      setStatus('pending');
      setStatusMsg('Submitting swap...');
      await txSwapExactAmountIn(
        pool.address, tokenIn, tokenOut, amountIn,
        parseFloat(slippage), rpcUrl, signer,
        () => { setStatus('approving'); setStatusMsg('Approving token...'); },
      );
      setStatus('success');
      setStatusMsg('Swap completed!');
      onSuccess();
    } catch (e: any) {
      setStatus('error');
      setStatusMsg(e?.message || 'Swap failed');
    }
  };

  const isBusy = status === 'approving' || status === 'pending';
  const minOut = estimatedOut
    ? (parseFloat(estimatedOut) * (1 - parseFloat(slippage) / 100)).toFixed(6)
    : '';

  return (
    <Dialog open={open} onClose={handleClose} PaperProps={{ className: cx('dialog-paper') }}>
      <div className={cx('modal-header')}>
        <h3>Swap</h3>
        <button className={cx('close-btn')} onClick={handleClose}>✕</button>
      </div>

      <div className={cx('modal-body')}>
        {/* Token In */}
        <div className={cx('input-group')}>
          <label>From</label>
          <select
            className={cx('token-select')}
            value={tokenIn.address}
            onChange={(e) => handleTokenInChange(e.target.value)}
          >
            {pool.tokens.map((t) => (
              <option key={t.address} value={t.address}>{t.symbol}</option>
            ))}
          </select>
        </div>

        <div className={cx('input-group')}>
          <label>Amount In</label>
          <div className={cx('input-wrap')}>
            <input
              type="number"
              min="0"
              placeholder="0.0"
              value={amountIn}
              onChange={(e) => setAmountIn(e.target.value)}
            />
            <span className={cx('input-suffix')}>{tokenIn.symbol}</span>
          </div>
        </div>

        {/* Flip button */}
        <div style={{ textAlign: 'center', margin: '4px 0' }}>
          <button
            onClick={handleFlip}
            style={{ background: 'none', border: '1px solid var(--tab-border)', borderRadius: 6, cursor: 'pointer', padding: '4px 12px', color: 'var(--body-text)' }}
          >
            ⇅ Flip
          </button>
        </div>

        {/* Token Out */}
        <div className={cx('input-group')}>
          <label>To</label>
          <select
            className={cx('token-select')}
            value={tokenOut.address}
            onChange={(e) => handleTokenOutChange(e.target.value)}
          >
            {pool.tokens.map((t) => (
              <option key={t.address} value={t.address}>{t.symbol}</option>
            ))}
          </select>
        </div>

        {estimatedOut && (
          <div className={cx('input-group')}>
            <label>Estimated Out</label>
            <div className={cx('input-wrap')}>
              <input type="text" readOnly value={estimatedOut} style={{ opacity: .7 }} />
              <span className={cx('input-suffix')}>{tokenOut.symbol}</span>
            </div>
          </div>
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

        {minOut && (
          <div className={cx('info-row')}>
            <span>Min received</span>
            <span>{minOut} {tokenOut.symbol}</span>
          </div>
        )}

        {status !== 'idle' && (
          <div className={cx('status-box', {
            'status-box--pending': status === 'approving' || status === 'pending',
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
          disabled={isBusy || status === 'success' || !amountIn || parseFloat(amountIn) <= 0}
          onClick={handleSubmit}
        >
          {isBusy ? statusMsg : 'Swap'}
        </button>
      </div>
    </Dialog>
  );
};

export default SwapModal;
