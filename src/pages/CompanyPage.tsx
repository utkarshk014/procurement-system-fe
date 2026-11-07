import { Link } from 'react-router-dom';
import CompanyForm from './CompanyForm';

export default function CompanyPage() {
  return (
    <>
      <div className="page-head row">
        <div>
          <h1>Company details</h1>
          <p className="muted">These details appear on reports and documents.</p>
        </div>
        <Link to="/" className="btn btn-secondary">
          Back to home
        </Link>
      </div>
      <CompanyForm />
    </>
  );
}
