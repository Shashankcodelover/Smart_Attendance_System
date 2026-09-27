export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-900 p-8">
      <div className="max-w-2xl bg-white p-8 rounded-lg shadow-md border border-gray-200">
        <h1 className="text-3xl font-bold mb-4">Privacy Policy</h1>
        <p className="mb-4">Last updated: {new Date().toLocaleDateString()}</p>
        <p className="mb-4">This is a placeholder privacy policy for the Smart Attendance System.</p>
        <h2 className="text-xl font-semibold mb-2">1. Data Collection</h2>
        <p className="mb-4">We collect basic information required for demonstration purposes. Location data used for geofencing is processed on your device.</p>
        <h2 className="text-xl font-semibold mb-2">2. Use of Data</h2>
        <p className="mb-4">Any data entered into this application is used solely to demonstrate functionality and is not used for real-world tracking.</p>
      </div>
    </div>
  );
}
