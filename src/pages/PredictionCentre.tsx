import { useState } from 'react';
import { SimplePredictor } from './SimplePredictor';
import { DixonColesPredictor } from './DixonColesPredictor';

type Method = 'simple' | 'dixon-coles';

export default function PredictionCentre() {
  const [method, setMethod] = useState<Method>('simple');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl uppercase tracking-wide">Prediction Centre</h1>
        <p className="text-ink-500 mt-1">Pick a method, then a fixture, for a statistical estimate.</p>
      </div>

      <div className="inline-flex border border-chalk-300 rounded-lg overflow-hidden bg-white">
        <TabButton active={method === 'simple'} onClick={() => setMethod('simple')}>
          Simple method
        </TabButton>
        <TabButton active={method === 'dixon-coles'} onClick={() => setMethod('dixon-coles')}>
          Dixon-Coles model
        </TabButton>
      </div>

      {method === 'simple' ? <SimplePredictor /> : <DixonColesPredictor />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'px-4 py-2 text-sm font-medium transition-colors',
        active ? 'bg-pitch-800 text-chalk-100' : 'text-ink-700 hover:bg-chalk-100',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
