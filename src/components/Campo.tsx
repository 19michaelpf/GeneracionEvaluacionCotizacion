interface CampoProps extends React.InputHTMLAttributes<HTMLInputElement> {
  etiqueta: string;
  name: string;
  error?: string;
}

/** Input con etiqueta y mensaje de error. */
export function Campo({ etiqueta, name, error, className, ...props }: CampoProps) {
  return (
    <div className={className}>
      <label className="label" htmlFor={name}>{etiqueta}</label>
      <input className="input" id={name} name={name} aria-invalid={!!error} {...props} />
      {error && <p className="error-campo">{error}</p>}
    </div>
  );
}
