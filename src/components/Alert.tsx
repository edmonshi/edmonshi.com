import { ReactNode } from "react";

interface Props {
  color: string;
  children: ReactNode;
  onDismiss: () => void;
}

const Alert = ({ color, children, onDismiss }: Props) => {
  return (
    <div className={"alert alert-" + color + " alert-dismissible"} role="alert">
      {children}
      <button
        type="button"
        className="btn-close"
        data-bs-dismiss="alert"
        aria-label="Close"
        onClick={onDismiss}
      ></button>
    </div>
  );
};

export default Alert;
