import { useParams } from "react-router-dom"
import { MotionConfig } from "framer-motion"
import { useAuth } from "@/context/AuthContext"
import GroupView from "@/components/group/GroupView"
import { useGroup } from "@/components/group/useGroup"

export default function Group() {
  const { id } = useParams()
  const { user } = useAuth()
  const { group, status, error, live, reload } = useGroup(id)

  return (
    <MotionConfig reducedMotion="user">
      <GroupView
        status={status}
        group={group}
        error={error}
        onRetry={() => reload()}
        currentUserId={user?.id}
        live={live}
      />
    </MotionConfig>
  )
}
