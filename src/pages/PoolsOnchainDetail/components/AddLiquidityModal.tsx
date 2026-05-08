import { Dialog } from '@material-ui/core';
import classnames from 'classnames/bind';
import React, { FC, useEffect, useState } from 'react';
import {
  estimateSingleAssetLpOut,
  getSigner,
  OnchainPool,
  OnchainToken,
  txJoinPool,
  txJoinswapExternAmountIn,
} from 'src/services/poolOnchain';
import styles from './modal.module.scss';

const cx = classnames.bind(styles);
type TxStatus = 'idle' | 'approving' | 'pending' | 'success' | 'error';
type Mode = 'single' | 'multi';

interface Props {
  open: boolean;
  onClose: () => void;
  pool: OnchainPool;
  rpcUrl: string;
  onSuccess: () => void;
}

const AddLiquidityModal: FC<Props> = ({ open, onClose, pool, rpcUrl, onSuccess }) => {
  const [mode, setMode] = useState<Mode>('single');
  const [selectedToken, setSelectedToken] = useState<OnchainToken>(pool.tokens[0]);
  const [amountIn, setAmountIn] = useState('');
  const [lpAmountOut, setLpAmountOut] = useState('');       // single mode estimate
  const [maxIn, setMaxIn] = useState('');                   // single mode: 50% pool balance cap
  const [estimateError, setEstimateError] = useState('');
  const [lpAmountDesired, setLpAmountDesired] = useState(''); // multi mode: LP tokens desired
  const [slippage, setSlippage] = useState('1');
  const [status, setStatus] = useState<TxStatus>('idle');
  const [statusMsg, setStatusMsg] = useState('');

  // Estimate LP out for single-asset mode
  useEffect(() => {
    if (mode !== 'single' || !amountIn || !selectedToken) { setLpAmountOut(''); setEstimateError(''); return; }
    estimateSingleAssetLpOut(pool.address, selectedToken, amountIn, rpcUrl)
      .then(({ lpOut, maxIn: max }) => { setLpAmountOut(lpOut); setMaxIn(max); setEstimateError(''); })
      .catch((e: any) => { setLpAmountOut(''); setEstimateError(e?.message || 'Estimate failed'); });
  }, [amountIn, selectedToken, mode]);

  const reset = () => {
    setAmountIn('');
    setLpAmountDesired('');
    setLpAmountOut('');
    setMaxIn('');
    setEstimateError('');
    setStatus('idle');
    setStatusMsg('');
  };

  const handleClose = () => { reset(); onClose(); };

  // Estimate proportional token amounts for multi-asset mode
  const multiTokenEstimates = (): string[] => {
    if (!lpAmountDesired || !pool.totalSupply || parseFloat(pool.totalSupply) === 0) return pool.tokens.map(() => '');
    const ratio = parseFloat(lpAmountDesired) / parseFloat(pool.totalSupply);
    return pool.tokens.map((t) => (parseFloat(t.balance) * ratio * (1 + parseFloat(slippage) / 100)).toFixed(6));
  };

  const handleSubmitSingle = async () => {
    if (!amountIn || parseFloat(amountIn) <= 0) return;
    try {
      setStatus('approving');
      setStatusMsg('Approving token...');
      const signer = await getSigner(rpcUrl);
      setStatus('pending');
      setStatusMsg('Submitting transaction...');
      await txJoinswapExternAmountIn(
        pool.address, selectedToken, amountIn,
        parseFloat(slippage), rpcUrl, signer,
        () => { setStatus('approving'); setStatusMsg('Approving token...'); },
      );
      setStatus('success');
      setStatusMsg('Liquidity added successfully!');
      onSuccess();
    } catch (e: any) {
      setStatus('error');
      setStatusMsg(e?.message || 'Transaction failed');
    }
  };

  const handleSubmitMulti = async () => {
    if (!lpAmountDesired || parseFloat(lpAmountDesired) <= 0) return;
    try {
      setStatus('approving');
      setStatusMsg('Approving tokens...');
      const signer = await getSigner(rpcUrl);
      setStatus('pending');
      setStatusMsg('Submitting transaction...');
      await txJoinPool(
        pool.address, pool.tokens, lpAmountDesired,
        parseFloat(slippage), rpcUrl, signer,
        () => { setStatus('approving'); setStatusMsg('Approving tokens...'); },
      );
      setStatus('success');
      setStatusMsg('Liquidity added successfully!');
      onSuccess();
    } catch (e: any) {
      setStatus('error');
      setStatusMsg(e?.message || 'Transaction failed');
    }
  };

  const isBusy = status === 'approving' || status === 'pending';
  const estimates = multiTokenEstimates();

  return (
    <Dialog open={open} onClose={handleClose} PaperProps={{ className: cx('dialog-paper') }}>
      <div className={cx('modal-header')}>
        <h3>Add Liquidity</h3>
        <button className={cx('close-btn')} onClick={handleClose}>✕</button>
      </div>

      <div className={cx('modal-body')}>
        {/* Mode tabs */}
        <div className={cx('tabs')}>
          <button className={cx('tab', { active: mode === 'single' })} onClick={() => { setMode('single'); reset(); }}>
            Single Asset
          </button>
          <button className={cx('tab', { active: mode === 'multi' })} onClick={() => { setMode('multi'); reset(); }}>
            Multi Asset
          </button>
        </div>

        {mode === 'single' ? (
          <>
            <div className={cx('input-group')}>
              <label>Token</label>
              <select
                className={cx('token-select')}
                value={selectedToken.address}
                onChange={(e) => {
                  const t = pool.tokens.find((x) => x.address === e.target.value);
                  if (t) { setSelectedToken(t); setAmountIn(''); }
                }}
              >
                {pool.tokens.map((t) => (
                  <option key={t.address} value={t.address}>{t.symbol}</option>
                ))}
              </select>
            </div>

            <div className={cx('input-group')}>
              <label>
                Amount In
                {maxIn && <span style={{ fontSize: 11, opacity: .6, marginLeft: 8 }}>max {maxIn} {selectedToken.symbol}</span>}
              </label>
              <div className={cx('input-wrap')}>
                <input
                  type="number"
                  min="0"
                  placeholder="0.0"
                  value={amountIn}
                  onChange={(e) => setAmountIn(e.target.value)}
                />
                {maxIn && (
                  <button
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', fontSize: 12 }}
                    onClick={() => setAmountIn(maxIn)}
                  >
                    MAX
                  </button>
                )}
                <span className={cx('input-suffix')}>{selectedToken.symbol}</span>
              </div>
            </div>

            {estimateError && (
              <div className={cx('status-box', 'status-box--error')} style={{ marginTop: 4 }}>
                {estimateError}
              </div>
            )}

            {lpAmountOut && parseFloat(lpAmountOut) > 0 && (
              <div className={cx('info-row')}>
                <span>Estimated LP tokens</span>
                <span>{lpAmountOut} BPT</span>
              </div>
            )}
          </>
        ) : (
          <>
            <div className={cx('input-group')}>
              <label>LP Tokens to Receive (BPT)</label>
              <div className={cx('input-wrap')}>
                <input
                  type="number"
                  min="0"
                  placeholder="0.0"
                  value={lpAmountDesired}
                  onChange={(e) => setLpAmountDesired(e.target.value)}
                />
                <span className={cx('input-suffix')}>BPT</span>
              </div>
            </div>

            {lpAmountDesired && parseFloat(lpAmountDesired) > 0 && (
              <>
                <hr className={cx('divider')} />
                <div className={cx('token-inputs')}>
                  {pool.tokens.map((t, i) => (
                    <div className={cx('info-row')} key={t.address}>
                      <span>Max {t.symbol}</span>
                      <span>{estimates[i] || '—'}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
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
          disabled={isBusy || status === 'success' || (mode === 'single' && !!estimateError)}
          onClick={mode === 'single' ? handleSubmitSingle : handleSubmitMulti}
        >
          {isBusy ? statusMsg : 'Add Liquidity'}
        </button>
      </div>
    </Dialog>
  );
};

export default AddLiquidityModal;
