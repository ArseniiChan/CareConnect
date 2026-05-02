// React hooks
import { useMemo, useState } from 'react'
// 3rd party libraries
import { BrowserRouter as Router, Routes, Route, BrowserRouter } from 'react-router-dom'
// Internal imports
import "./App.css"
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import AppointmentsPage from './pages/AppointmentsPage'
import MessagesPage from './pages/MessagesPage'
import LoginPage from './pages/LoginPage'
import ProfilePage from './pages/ProfilePage'
import CareGiversPage from './pages/CareGiversPage'




export default function App() {
  return (
    <BrowserRouter>
        <Routes>
          // Public routes  
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/appointments" element={<AppointmentsPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/caregivers" element={<CareGiversPage />} />
          </Route>
          // Auth routes
          <Route path="/login" element={<LoginPage />} />
        </Routes>
    </BrowserRouter>
  )
}
