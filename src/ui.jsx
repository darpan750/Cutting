import { useEffect, useRef } from 'react';
import { readableError } from './model.js';

export function Panel({ title, secondary, actions, children, className = '' }) {
  return <section className={`panel ${className}`}>
    <div className="panel-heading"><div><h2>{title}</h2>{secondary && <p>{secondary}</p>}</div>{actions && <div className="actions no-print">{actions}</div>}</div>
    {children}
  </section>;
}

export function Field({ label, value, change, options, type = 'text', ...attributes }) {
  return <label className={type === 'textarea' ? 'field wide' : 'field'}>
    <span>{label}{attributes.required && <span aria-hidden="true" className="required"> *</span>}</span>
    {options ? <select {...attributes} value={value ?? ''} onChange={event => change(event.target.value)}>
      {options.map(([option, name]) => <option value={option} key={option}>{name}</option>)}
    </select> : type === 'textarea' ? <textarea {...attributes} value={value ?? ''} onChange={event => change(event.target.value)} /> :
      <input {...attributes} type={type} value={value ?? ''} onChange={event => change(event.target.value)} />}
  </label>;
}

export function DataTable({ label, headings, children, className = '' }) {
  return <div className="table-scroll" tabIndex="0" role="region" aria-label={label}>
    <table className={className}><thead><tr>{headings.map((heading, index) => <th scope="col" key={index}>{heading}</th>)}</tr></thead>{children}</table>
  </div>;
}

export function ErrorNotice({ error, retry }) {
  if (!error) return null;
  return <div className="notice error" role="alert">{readableError(error)}{retry && <button type="button" className="button small" onClick={retry}>Retry</button>}</div>;
}

export function Empty({ children }) {
  return <p className="empty">{children}</p>;
}

export function Dialog({ title, close, busy, children }) {
  const element = useRef(null);
  useEffect(() => {
    element.current.showModal();
  }, []);
  return <dialog ref={element} aria-labelledby="dialog-heading" onCancel={event => { event.preventDefault(); if (!busy) close(); }}>
    <div className="dialog-heading"><h2 id="dialog-heading">{title}</h2><button className="button small" type="button" disabled={busy} onClick={close}>Close</button></div>
    {children}
  </dialog>;
}

export function Facts({ rows }) {
  const visible = rows.filter(([,value]) => value !== '' && value != null);
  return visible.length > 0 && <dl className="facts">{visible.map(([label,value], index) => <div key={index}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
