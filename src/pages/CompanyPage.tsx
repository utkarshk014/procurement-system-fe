import { PageHead } from '../components/ui';
import CompanyForm from './CompanyForm';

export default function CompanyPage() {
  return (
    <>
      <PageHead title="Company details" subtitle="These details appear on reports and documents." />
      <CompanyForm />
    </>
  );
}
