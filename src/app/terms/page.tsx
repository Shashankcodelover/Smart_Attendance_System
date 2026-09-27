export default function TermsOfService() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-900 p-8">
      <div className="max-w-2xl bg-white p-8 rounded-lg shadow-md border border-gray-200">
        <h1 className="text-3xl font-bold mb-4">Terms of Service</h1>
        <p className="mb-4">Last updated: {new Date().toLocaleDateString()}</p>
        <p className="mb-4">This is a placeholder terms of service document for the Smart Attendance System.</p>
        <h2 className="text-xl font-semibold mb-2">1. Acceptance of Terms</h2>
        <p className="mb-4">By accessing this demonstration site, you agree to these terms.</p>
        <h2 className="text-xl font-semibold mb-2">2. Usage</h2>
        <p className="mb-4">This application is for portfolio and demonstration purposes only.</p>
      </div>
    </div>
  );
}
